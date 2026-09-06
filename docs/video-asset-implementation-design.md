# Video / Asset 基础设施实现设计

状态：**实现前设计。未写业务代码。**  
上层架构：[media-asset-architecture.md](./media-asset-architecture.md)。  
本文件把那份架构收成**可落地的表结构、模块边界、API、Provider 接口与迁移步骤**。评审通过后再实现。

本 Step 没有修改业务代码、Schema、migration、API、Agent、Frontend，没有安装依赖，没有接 Redis/BullMQ，没有调用真实媒体 Provider。

---

## 1. 当前代码检查结果

核查对象：`database/prisma/schema.prisma`、全部 migration、`apps/backend/src/{agents,content-plans,scripts,projects,app.module}`、`apps/frontend`、`workers/`、`docs/media-asset-architecture.md`。

### 1.1 已有、必须沿用

| 事实 | 代码位置 |
| --- | --- |
| 隔离键 `tenantId + workspaceId + projectId` | Project / ContentPlan / Script / Video / AgentRun |
| JWT 提供 `tid/wid`；客户端禁止传 tenant | Auth + ValidationPipe `forbidNonWhitelisted` |
| 业务查询 `findFirst({ id, tenantId, workspaceId })` | ScriptsService / ContentPlansService / AgentsService |
| `update` 用复合键 `id_tenantId` | 同上 |
| Agent 同步 `execute()`；`enqueue()` 501 | `agent.engine.ts` |
| Script 无文件字段；`payload` 是文本合同 | `script-generation.types.ts` |
| `sourceAgentRunId` 无 FK | ContentPlan / Script |
| 无 VideosModule、无 `/videos`、无 Asset、无 Job 表 | `app.module.ts`、Prisma |
| workers 空脚手架，无 Redis/BullMQ | `workers/src/index.ts` |

### 1.2 现有 Video（必须兼容）

`init_core_schema` 起即存在，注释：「只存路径 / storage key，不存二进制。」

| 列 | 现状 | V1 处理 |
| --- | --- | --- |
| id / tenantId / workspaceId / projectId | 保留 | 保留 |
| scriptId 可空，FK 到 scripts，**无租户复合 FK** | 保留 | 保留；写入时应用层校验同租户 |
| filePath | 可选文本 | **保留列，停止新写入** |
| duration / width / height | 可选 | 保留，成片列表冗余 |
| status VideoStatus | `PENDING PROCESSING COMPLETED FAILED`，默认 PENDING | **枚举不改**；应用层写入规则收紧，见第 5 节 |
| createdAt / updatedAt / deletedAt | 保留 | 保留 |
| Analytics → Video | 已有 | 不改；仍挂成片业务对象 |

`database/test/schema.test.ts` 已插入 `filePath: "s3://acf/videos/demo.mp4"` 与 `"local/demo.mp4"`。这些**不是真实对象**，迁移不能去拉文件。

### 1.3 依赖关系（实现时不要拆错）

```
ScriptsModule ──依赖──► AgentsModule
ContentPlansModule ──► AgentsModule
VideosModule（未来）──► ScriptsModule（读 CONFIRMED Script）
                   ──► StorageModule
                   ──► 不依赖 ModelRouter 直连
AssetsModule（未来）──► StorageModule
                   ──► 不依赖 ScriptsModule
Agent Engine        ──► 不引入 Storage / FFmpeg
```

VideosService **禁止**直接调 `ModelRouter` 或厂商 SDK。与 ScriptsService 禁止直调 Provider 同一原则。

### 1.4 与架构文档的收口

`media-asset-architecture.md` 已定：Asset 统一文件、Video 是成片、Job ≠ AgentRun、StorageService 抽象、影视共用 Asset。  
本文件补齐实现选择：`outputAssetId` 去留、状态枚举、上传协议、migration 切分、幂等、V1 API 范围。

---

## 2. 最终数据库模型（建议 Prisma 形状，现在不要执行）

新枚举：`AssetType` `AssetStatus` `AssetLinkRole` `JobKind` `JobStatus`。  
**不改** `VideoStatus` 枚举值（避免历史行与 schema test 语义破裂）。

新表：`assets`、`asset_links`、`jobs`。  
扩展：`videos.output_asset_id`、`videos.source_job_id`。  
**不删** `videos.file_path`。

`Tenant` / `Workspace` / `Project` 增加 relation。Video 增加可选 `outputAsset` / `jobs` / `assetLinks`。

查询一律带 `tenantId + workspaceId`；列表再带 `projectId`。禁止 `findUnique({ id })`。

---

## 3. Asset 设计

Asset = 一份已存储（或正在入库）文件的元数据。**不是** Video，**不是** Job。

### 3.1 列

| 列 | 必填 | 说明 |
| --- | --- | --- |
| id | 是 | UUID v7 |
| tenantId / workspaceId / projectId | 是 | 与现网一致 |
| type | 是 | AssetType |
| status | 是 | 默认 `PENDING` |
| storageProvider | 是 | 如 `local`；不是 URL |
| storageKey | 是 | 权威定位 |
| originalFilename | 否 | **展示用**，禁止当 key |
| mimeType | 否 | 服务端探测/白名单，不信任客户端 |
| size | 否 | 字节 |
| duration / width / height | 否 | 音视频/图片；其它类型 null |
| metadata | 是 | Json 默认 `{}`：checksum、codec、source、ffprobe 等 |
| createdAt / updatedAt / deletedAt | 是/软删 | 与 Script/Video 一致 |

唯一与索引：

- `@@unique([id, tenantId])`
- `@@unique([tenantId, storageProvider, storageKey])`
- `@@index([tenantId, workspaceId, projectId, type])`
- `@@index([tenantId, status])`

### 3.2 AssetType

`IMAGE | VIDEO | AUDIO | SUBTITLE | DOCUMENT | SOURCE_VIDEO | SOURCE_AUDIO | OTHER`

`SOURCE_*` 表示用户上传原片/原音，生成结果用 `VIDEO` / `AUDIO`。封面用 `IMAGE`，角色靠 AssetLink。

### 3.3 AssetStatus

用户候选：`PENDING READY FAILED DELETED`，并问是否要 `PROCESSING`。

| 状态 | V1 是否采用 | 原因 |
| --- | --- | --- |
| PENDING | 是 | 记录已建、字节未确认（上传中 / 两阶段未 complete） |
| READY | 是 | 可被 Video/Job 引用、可下载 |
| FAILED | 是 | 上传校验失败、写入存储失败 |
| PROCESSING | **枚举要有，V1 写入可选** | 转码/抽帧/病毒扫描是真实中间态。没有它只能误用 PENDING 或 READY。Postgres 枚举后补也可以，但本功能第一次建表就带上，避免第二次 `ADD VALUE` |
| DELETED | **不要** | 现网 Script/Video/ContentPlan 用 `deletedAt`，不用 DELETED 枚举。Asset 同样软删 |

权威访问路径：**永远不要把公网 URL 当列**。`GET` 时 `StorageService` 签发短 TTL 地址或由 Backend 代理流。

---

## 4. AssetLink 设计

禁止在 Video 上堆 `coverAssetId` / `audioAssetId` / `subtitleAssetId`。

### 4.1 列

| 列 | 说明 |
| --- | --- |
| id | UUID v7 |
| tenantId / workspaceId / projectId | 冗余隔离，查询必须带 |
| assetId | 必填 |
| videoId | 可选 |
| jobId | 可选 |
| role | AssetLinkRole |
| sortOrder | Int 默认 0，多 CLIP 排序 |
| createdAt | |

约束：

- `videoId`、`jobId` **至少其一**（应用层 + 可选 CHECK）
- 允许**两者都有**：同一文件先挂 Job，完成后再挂 Video
- Asset / Video / Job 必须同一 `tenantId + workspaceId + projectId`
- `@@unique([tenantId, videoId, assetId, role])` 其中 videoId 非空时防重复；job 侧同样可 `@@unique([tenantId, jobId, assetId, role])`（Prisma 对可空 unique 的 NULL 多次允许，应用层去重）
- 外键：asset 用 `(assetId, tenantId)` 复合更安全；若与现 `Video.scriptId` 一样做单列 FK，则**写入必须校验租户**（推荐复合，与 Workspace 模式一致）

无 `deletedAt`：删 Video/Job 的链接用硬删行；Asset 本身软删。Restrict：Asset 仍被 link 引用时删除 Asset → 409。

### 4.2 role（可扩展字符串枚举）

V1 写入集合：

```
VIDEO_OUTPUT
VIDEO_SOURCE
VIDEO_AUDIO
VIDEO_BGM
VIDEO_SUBTITLE
VIDEO_COVER
VIDEO_PREVIEW

MOVIE_SOURCE
MOVIE_CLIP
MOVIE_VOICEOVER
MOVIE_SUBTITLE
MOVIE_COVER
MOVIE_OUTPUT
```

未列中的角色 **禁止** 在未改枚举前写入。扩角色 = 新 migration `ADD VALUE`，不改表结构。

`VIDEO_OUTPUT` = 抖音成片文件；`MOVIE_OUTPUT` = 影视导出。不要用同一个 role 混两条产品线，素材库筛选才清楚。

### 4.3 是否关联 Job

**允许 `jobId`。** 中间产物（TTS 音轨、分镜片段）在 Video 尚未 COMPLETED 时就要能查。  
约束：Job 完成后，Service **在同一事务**把需要保留的 link 复制到 `videoId`（可同时保留 jobId）。Job 失败不强制删中间 Asset（便于 retry 续跑）；V2 再做孤儿清理。

---

## 5. Video 设计

Video = 成片业务对象。文件在 Asset。

### 5.1 保留与新增

保留：隔离键、`scriptId?`、`filePath?`、`duration/width/height`、`VideoStatus`、时间戳。  
新增：`outputAssetId?`、`sourceJobId?`（均无 FK，同 `sourceAgentRunId`）。

`scriptId` 继续可空：影视成片可以没有 Script。

### 5.2 outputAssetId：A / B / C

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A | 只存 `Video.outputAssetId` | 列表一条 join | 无法表达配音/字幕/封面；退回 filePath 老路 |
| B | 只靠 AssetLink `VIDEO_OUTPUT` | 单一真相；扩展角色零成本 | 每个列表多一次 link 查询；容易出现 0 条或多条 OUTPUT 无约束 |
| C | 两者都有 | 列表走指针；多文件走 link | 双写可能漂移 |

**最终推荐：C，且规定写路径。**

理由（不是感觉）：

1. 现网 Script 已是「行上 `title` + JSON `payload.title`」双写，列表不解析 JSON。Video 列表同样需要「当前成片文件」而不扫全部 link。
2. 架构要求一个 Video 多 Asset，A 不够。
3. 仅 B 时，必须另加「每个 Video 至多一条 VIDEO_OUTPUT」的部分唯一索引；有了该索引后 `outputAssetId` 仍能避免列表二次查询，成本只是一次同事务赋值。
4. 漂移防治：只有 `VideosService` / Job 完成回调 写入 `outputAssetId`，且必须同时 upsert `AssetLink(role=VIDEO_OUTPUT)`。禁止 Controller 单独 PATCH 指针。读路径：列表用 `outputAssetId`；详情用 AssetLink。若不一致，以 **AssetLink VIDEO_OUTPUT** 为准，指针视为缓存，可修复任务校正。

部分唯一（实现阶段）：`(tenantId, videoId) WHERE role = 'VIDEO_OUTPUT'`。

### 5.3 VideoStatus vs JobStatus

用户要求：**不要让 Video 承担 Job 执行态。**  
现枚举已有 `PROCESSING`，**不删除**（与 Script 保留 `GENERATING` 相同）。

应用层约定（V1 只写这三种）：

| Video.status | 含义 |
| --- | --- |
| PENDING | 已创建，尚无成功 `VIDEO_OUTPUT` |
| COMPLETED | 已有 READY 的输出 Asset（产品完成） |
| FAILED | 最新 Job 已终态失败，且仍无输出（产品未做成） |
| PROCESSING | **不写**。进行中看 Job |

`GET /videos` 需要「进行中」时：join 最新 Job `status IN (PENDING, RUNNING)`，或 API 返回 `job` 嵌套对象，而不是把 Video 改成 PROCESSING。

`filePath`：新代码不写。读：若 `outputAssetId` 空且 `filePath` 非空，视为 legacy（见第 17 节）。

---

## 6. Job 设计

**不建 Task 表。** 一张 `jobs`，用 `kind` 区分。

### 6.1 列

| 列 | 说明 |
| --- | --- |
| id | UUID v7 |
| tenantId / workspaceId / projectId | 必填 |
| kind | JobKind |
| status | 默认 `PENDING` |
| provider / model | 可选字符串，如 `mock-video` |
| input / output / error | Json；output 记 assetId 列表，不记 Key/Prompt |
| progress | Int 0–100，默认 0 |
| requestId | 关联日志；与 AgentRun.requestId 同形 |
| scriptId / videoId | 可选，无 FK |
| agentRunId | 可选，无 FK |
| startedAt / completedAt / createdAt / updatedAt | 无 deletedAt（审计，同 AgentRun） |

索引：`(tenantId, workspaceId, projectId)`、`(tenantId, status)`、`(videoId)`、`(kind, createdAt)`、`@@unique([id, tenantId])`。

### 6.2 JobKind

`VIDEO_GENERATION | MOVIE_EDITING | TTS_GENERATION | SUBTITLE_GENERATION | VIDEO_COMPOSE`

V1 只创建 `VIDEO_GENERATION`。其它 kind 占位，防止影视/TTS 再长一套表。

### 6.3 JobStatus

| 状态 | 采用 | 说明 |
| --- | --- | --- |
| PENDING | 是 | 已落库，尚未跑 Provider |
| RUNNING | 是 | Provider 进行中 |
| COMPLETED | 是 | 与 AgentRun 用词对齐（不用 SUCCEEDED） |
| FAILED | 是 | |
| CANCELLED | 是 | 用户取消；V1 可只建枚举 |
| RETRYING | **否** | 见第 18 节：retry = **新 Job**。旧行保持 FAILED。RETRYING 与 RUNNING 无法区分，且破坏「一行一次执行」审计 |

进度只在 RUNNING 更新；COMPLETED 时 progress=100。

---

## 7. AgentRun / Job 关系

| | AgentRun | Job |
| --- | --- | --- |
| 现在 | 已有，同步 LLM | 无 |
| 职责 | Prompt/模型 JSON、token | 媒体耗时、文件、厂商 |
| V1 视频 | **不强制**新 Agent | `VIDEO_GENERATION` 必有 |

候选：

- `AgentRun.jobId`：让 LLM 审计行依赖媒体层，方向反了；一次 Run 多 Job 时不够。
- `Job.agentRunId`：与现网 `Script.sourceAgentRunId` 同构；Job 可无 Run（V1 Service 直接读 Script.payload）。
- 都不关联：排障要对 requestId 模糊搜。

**最终推荐：只加 `Job.agentRunId?`，不加 `AgentRun.jobId`，无数据库 FK。**

V1 `POST /videos`：**可以不跑** `video.generation` Agent（尚未实现该 Agent）。Job.agentRunId = null。V2 若增加计划 Agent，先 `AgentsService.execute()`，再创建 Job 并填 agentRunId。

禁止把渲染放进 `AgentEngine.execute()`（60s 超时 + 同步 HTTP）。

---

## 8. StorageProvider

```
StorageService
  └── StorageProvider
        ├── LocalStorageProvider     // 实现阶段 V1
        └── S3CompatibleStorageProvider  // 以后，同一接口
```

接口（只设计）：

```
put(key, body, opts: { mimeType?, contentLength? }): { provider, key, size }
get(key): stream
delete(key): void
exists(key): boolean
signGet?(key, ttlSeconds): string   // Local V1 可省略，由 API 代理下载
```

业务模块（Videos/Assets/Scripts/Agents）**禁止** `fs.readFile` / `fs.writeFile` / AWS SDK。  
仅 `LocalStorageProvider` 内部允许 fs。

### 8.1 storageKey 规范（最终）

不要用「可读文件名」或用户上传名。不要把环境无关的绝对盘符写进库。

```
v1/{tenantId}/{workspaceId}/{projectId}/{assetId}/{objectId}
```

| 段 | 规则 |
| --- | --- |
| v1 | key 版本，迁存储时换前缀而不换表 |
| 三个 UUID | 与行隔离键一致；桶泄露时仍可按租户扫 |
| assetId | 与 Asset.id 相同，便于孤儿对账 |
| objectId | 另发 UUID，禁止 `originalFilename`；同 Asset 替换文件时换 objectId、旧 key 标记删除 |

禁止 `..`、`/` 拼接用户输入、反斜杠、空字节。生成后只允许匹配：

`^v1/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$`

Local 根目录：配置项如 `STORAGE_LOCAL_ROOT`，真实路径 = `root + key`。校验 resolve 后仍在 root 下。

S3 迁移：key **保持不变** 拷到新桶，只改 `storageProvider`。这是把 UUID 放进 key、不放本地盘符的原因。

---

## 9. VideoProvider

```
interface VideoProvider {
  readonly id: string;
  readonly capabilities: Array<'script-to-video' | 'text-to-video' | 'image-to-video'>;
  render(req: VideoProviderRequest): Promise<VideoProviderResult>;
}
```

`VideoProviderRequest`：`requestId`、隔离上下文（仅日志）、`scriptPayload` 或文本/图片 Asset id、时长、比例。**不包含 API Key。**  
`VideoProviderResult`：写入 Storage 后的 `storageKey` + duration/width/height，**不是**外链 URL。

V1 唯一实现：**MockVideoProvider**。经 StorageService 放一个最小合法媒体占位（例如短 mp4 或明确标注的 mock 容器）。不访问 Router One / 即梦 / Kling / Runway。

以后加厂商 = 新 class + register，不改 Controller、不改 Asset 表。

---

## 10. TTS / Image / Subtitle / Compose Provider

同样只定义接口，V1 **不实现、不 Mock 也可**（Script→Video 的 Mock 可一步写出「成片」而不拆 TTS）。

```
TtsProvider.synthesize → { storageKey, duration, mimeType }
ImageProvider.generate → { storageKey, width, height, mimeType }
SubtitleProvider.render → { storageKey, mimeType }  // srt/vtt
ComposeProvider.compose(inputs: AssetRef[]) → { storageKey, duration, width, height }
```

编排只发生在 `VideoGenerationService` / 未来 `MovieEditingService`。  
禁止业务层 import OpenAI、ElevenLabs、FFmpeg 包装库、各家视频 SDK。

---

## 11. Script → Video 流程

```
POST /videos { scriptId, ...config? }
  → JWT + Permissions
  → findFirst Script { id, tenantId, workspaceId, deletedAt: null }
  → 404 若无（含跨租户）
  → projectId 取自 Script 行，再校验 Project
  → Script.status !== CONFIRMED → 409
  → 创建 Video PENDING（无 filePath）
  → 创建 Job VIDEO_GENERATION PENDING（videoId, scriptId, input=config+script 快照 id）
  → （V1 Mock）JobRunner 调 VideoGenerationService
       → VideoProvider.render
       → StorageService.put
       → Asset READY type=VIDEO
       → AssetLink VIDEO_OUTPUT（+ 可选其它 role）
       → Video.outputAssetId / duration / width / height
       → Job COMPLETED；Video COMPLETED
  → 返回 Video（含 job 摘要、outputAsset 摘要）
```

Provider 失败：Job FAILED + error.code；Video FAILED（无 OUTPUT 时）。**不删** Video 行。已写入的中间 Asset 保留。

客户端允许：

```
scriptId                 // 必填 UUID
voiceStyle?              // 覆盖 Script.payload.voiceStyle，不改 Script
visualStyle?
aspectRatio?             // 如 9:16
resolution?              // 如 1080x1920
targetDuration?          // 不得与 Script 目标冲突到无法执行；非法 400
requirements?
```

禁止：`tenantId workspaceId projectId userId filePath url outputAssetId`。

DRAFT / ARCHIVED Script：409，错误码建议 `VIDEO_SCRIPT_NOT_CONFIRMED`（与「规划 DRAFT 不能出脚本」同类，不复用 `SCRIPT_CONFLICT`，以免和 PATCH 脚本状态机混淆）。

---

## 12. Asset API

| 方法 | 路径 | V1 | 说明 |
| --- | --- | --- | --- |
| POST | `/assets` 或 `/assets/init` + upload | 是 | 见第 14 节 |
| GET | `/assets?projectId=` | 是 | 可选 type/status |
| GET | `/assets/:id` | 是 | 含下载指示（签名或短路径），不含存储根路径泄露 |
| DELETE | `/assets/:id` | 是 | 软删；仍被 VIDEO_OUTPUT 引用 → 409 |

无 PATCH 改文件内容（V2 再替换 objectId）。

权限：写 ≈ `project:update` 或新 `asset:write`；生成视频写 Asset 走服务端 Job，不要求用户再调 POST /assets。

---

## 13. Video API

| 方法 | 路径 | V1 | V2 |
| --- | --- | --- | --- |
| POST | `/videos` | **是** | |
| GET | `/videos?projectId=` | **是** | 可选 scriptId/status |
| GET | `/videos/:id` | **是** | 嵌套 links、latest job |
| PATCH | `/videos/:id` | 否 | 仅元数据（title），禁止改 status/asset |
| POST | `/videos/:id/cancel` | 否 | 无队列时意义有限 |
| POST | `/videos/:id/retry` | **建议 V1 有** | 新 Job，见第 18 节 |
| GET | `/jobs/:id` | 否 | 进度可挂在 Video 详情 |

列表必填 `projectId`，否则 400（与 GET /scripts 相同）。

---

## 14. 文件上传策略

三种对比：

| 方案 | V1 Local | 未来 S3/OSS/R2 |
| --- | --- | --- |
| 单次 multipart JSON 混传 | 实现简单，大文件拖死 Nest 超时 | 流量打满 API 机 |
| 预签名 URL | Local 没有真 S3 签名语义 | 标准 |
| 两阶段 | init 建 PENDING Asset + key；upload 写存储；complete READY | init 返回 `uploadUrl`；客户端 PUT；complete 头校验 size |

**V1 推荐：两阶段契约 + Local 由 Backend 收流。**

1. `POST /assets/init` `{ type, originalFilename, mimeType, size? }` → Asset PENDING + storageKey（服务端生成）
2. `PUT /assets/:id/content` `multipart/form-data` 字段 `file`（Local 实现）
3. `POST /assets/:id/complete` → 校验 size/mime，status READY

S3 时第 2 步改为客户端对预签名 URL PUT，Backend 不碰字节；第 1/3 步不变。**不要** V1 就做预签名（会提前绑 S3 SDK）。

限制：单文件建议 ≤ 32MB（图片/字幕/短音频）；`SOURCE_VIDEO` 影视原片 V2 再抬到数百 MB + 直传。V1 若只为封面/测试文件，32MB 足够。Script→Video 的 Mock 输出走 Job，不走用户上传。

---

## 15. 文件安全（V1）

| 风险 | 策略 |
| --- | --- |
| 大小 | init 声明 size 与实际上传一致；超限 400；整请求 body limit |
| MIME / 扩展名 | 白名单：`image/png jpeg webp`、`audio/mpeg wav`、`video/mp4`、`text/plain`+`.srt/.vtt`、`application/json`。MIME 与扩展名双匹配，只信服务端探测 |
| 文件名 | 存 originalFilename（截断 200，去路径），**不**进 storageKey |
| 路径穿越 | key 仅 UUID 段；Local resolve 必须落在 root 内 |
| 租户隔离 | where 带 tenant+workspace+project；key 含三 UUID；下载再鉴权 |
| 恶意文件 | V1 不跑解码器/FFmpeg；mp4 当不透明 blob。不执行上传内容 |
| 重复上传 | 不按 checksum 去重（跨项目误共享）。同项目可选 metadata.checksum 提示，不合并 id |
| 软删 | deletedAt；GET 默认排除 |
| 物理删 | V1 不做；V2 延迟删存储 |
| 临时文件 | Local 先写 `{key}.part` 再 rename；失败删 part |
| 孤儿 | complete 从未调用的 PENDING，定时（V2）过期 FAILED。V1 可不管 |
| 下载 | 禁止返回磁盘绝对路径；禁止把 `STORAGE_LOCAL_ROOT` 暴露给前端 |

---

## 16. 影视剪辑预留

不实现 `movie.editing:v1`。不新增 MovieAsset / MovieFile / MovieJob。

未来接入：

```
POST /assets  SOURCE_VIDEO（用户原片）
  → Agent movie.editing:v1 → AgentRun（JSON 选段，可选）
  → Job kind=MOVIE_EDITING
  → AssetLink MOVIE_* 
  → 新建 Video（scriptId null）+ MOVIE_OUTPUT / outputAssetId
```

与抖音共用：Asset、AssetLink、Job、Storage、Video 表。仅 Service / Agent / role / kind 不同。

---

## 17. Migration 方案

**禁止改历史 migration。**

候选：一张 `add_media_asset_job_video` vs 拆 `add_assets` / `add_jobs` / `extend_video`。

**最终推荐：一张 `add_media_asset_job_video`。**

理由：Asset 无 Job/Video 扩展则无法测 link；Video 新列依赖 Asset.id。拆三条会让中间 migrate 状态不完整。现网 `add_content_plan_versioning`、`add_script_topic_versioning` 都是「一特征一文件」。枚举 + 三表 + 两列仍在同一特征内。

内容（实现时）：

1. 建枚举 AssetType / AssetStatus / AssetLinkRole / JobKind / JobStatus
2. 建 assets、jobs、asset_links
3. `videos` ADD `output_asset_id UUID`、`source_job_id UUID`（无 FK）
4. 索引如上
5. **不 DROP file_path，不改 VideoStatus**

### 旧 filePath

| 步骤 | 做法 |
| --- | --- |
| 迁移 SQL | 不自动造 Asset（测试数据是假路径，造了也无法 get） |
| 应用兼容 | 读 Video：优先 outputAssetId → AssetLink VIDEO_OUTPUT → 再 filePath（legacy 标记） |
| 可选脚本 | 若 filePath 非空且无 outputAssetId：插入 Asset `storageProvider='legacy'`、`storageKey=原 filePath`、`status=READY`、link VIDEO_OUTPUT。仅生产有真实文件时跑 |
| 废弃 | V2 确认无读路径后再 DROP COLUMN |

schema test 继续允许只写 filePath 的旧行，直到有人改那个测试（实现阶段再加新列断言，**不要为测试改生产逻辑**）。

---

## 18. 幂等与并发

**同一 Script 允许多个 Video。** 与「同 Topic 多个 Script version」一致，禁止覆盖。无 `unique(scriptId)`。

**同一 Job 不重复执行。** Worker 抢占：`UPDATE ... WHERE id=? AND status=PENDING` 改为 RUNNING，影响行数 0 则放弃。无 Redis。

**Retry：创建新 Job**，不复用旧行。旧 Job 保持 FAILED。`Video.sourceJobId` 指向最新 Job。已有 OUTPUT 时 retry 是否覆盖：V1 仅当 Video 为 FAILED 或仍无 OUTPUT 时允许；COMPLETED 再生成请 **POST /videos 新成片**，避免悄悄替换已发布文件。

幂等（无 Redis）：

- 可选请求头 `x-idempotency-key`（V1 可用 `x-request-id`）：同一 tenant + scriptId + key 在 24h 内返回同一 Video。实现用 `jobs.requestId` 或 `input.idempotencyKey` 查询，**不**对 requestId 全局 unique（现 AgentRun 也未 unique）
- 无该头：每次 POST 新 Video + 新 Job

并发双 POST 无 key：两个 Video，可接受。

---

## 19. Worker / Queue 预留

```
Backend API  →  insert Job PENDING
JobRunner     →  现：InProcessJobRunner（实现阶段；可请求内跑 Mock，或 setImmediate）
              →  后：workers/ 消费同一张 jobs 表
```

**API 不依赖 workers 进程活着才能 201。** 创建 Video+Job 即成功。Mock V1 为了 e2e 可在同进程跑完再返回 COMPLETED（与现在 POST /scripts 同步类似），但状态机仍是 Job 行，便于以后把执行挪出 HTTP。

未来 BullMQ：payload `{ jobId, tenantId, workspaceId, projectId }`，Worker 再用三键 `findFirst` 加载，禁止只信队列里的业务 JSON 改库。  
本设计阶段 **不安装** Redis/BullMQ。

---

## 20. Frontend 规划（不实现）

| 路径 | 职责 |
| --- | --- |
| `/dashboard/assets` | 项目素材列表、上传、类型、软删 |
| `/dashboard/videos` | 成片列表：状态、Script 标题、时长、创建时间 |
| `/dashboard/videos/[id]` | 预览输出 Asset、进度（来自 Job）、error.code、耗时、重试 |

不展示 API Key、Prompt、Storage root、JWT。  
素材库独立，不塞进脚本页。

---

## 21. 多租户隔离

Asset / AssetLink / Job / Video 均含 `tenantId + workspaceId + projectId`。

| 操作 | where |
| --- | --- |
| getById | `id + tenantId + workspaceId + deletedAt null` |
| list | 上式 + `projectId`（客户端 query，先 `requireProject`） |
| 更新 | `id_tenantId` 复合，且事先 findFirst 已校验 workspace |

跨租户 / 跨 workspace：404。无权限：403。  
创建 Video 时 projectId **只从 Script 行复制**。  
AssetLink 若 asset.projectId ≠ video.projectId → 400。  
下载/签名 URL 再次走同一 getById。

---

## 22. V1 / V2 / V3 边界

| | V1（下一实现 Step） | V2 | V3 |
| --- | --- | --- | --- |
| Schema | 本文件第 2–6 节 | thumbnail 快捷列、checksum 列、DROP file_path | 发布态 |
| Storage | 接口 + Local | S3 兼容 | 多桶迁移 |
| Provider | MockVideoProvider | 一个真实 Compose 或一个真实视频 API | 多厂商 |
| Agent | 不新增 video Agent | 可选 video.generation:v1 计划 | movie.editing:v1 |
| 队列 | InProcessJobRunner | BullMQ | 重试/死信 |
| 上传 | 两阶段 Local | 预签名直传 | 大文件 SOURCE_VIDEO |
| API | POST/GET videos，Asset CRUD，retry | cancel、PATCH、GET job | 影视 API |
| 禁止 | FFmpeg 真依赖、Redis、厂商 SDK | | |

---

## 23. 风险清单

| 风险 | 缓解 |
| --- | --- |
| outputAssetId 与 Link 不一致 | 同事务双写；读详情以 Link 为准 |
| filePath 与 Asset 两套路径 | 停止写 filePath；读有回退 |
| VideoStatus.PROCESSING 被误用 | 应用层不写；文档与测试锁定 |
| 同步 Mock 让人以为生产也同步 | e2e 断言有 Job 行；契约允许 PENDING |
| Local 路径穿越 | UUID key + root jail |
| 无 FK 的 sourceJobId 填错租户 | 写入只复制已校验 Job.id |
| 影视以后另起炉灶 | kind/role 已预留；评审卡住重复表 |
| schema test 假 s3 路径 | 不自动转 Asset |
| 大文件撑爆 API | V1 32MB；影视直传放到 V2 |
| Job 与 AgentRun 超时策略混用 | 渲染永不进 AgentEngine.execute |

---

## 24. 推荐最终架构图

```
Frontend
  POST /videos { scriptId }
  POST /assets/init + PUT content
        │
        ▼
VideosService / AssetsService     （业务，读 JWT）
        │
        ├── Script（CONFIRMED，同租户）
        ├── Job 行
        └── Video 行
                │
                ▼
        VideoGenerationService
                │
                ├── VideoProvider（V1 = Mock）
                ├── StorageService → LocalStorageProvider
                ├── Asset + AssetLink
                └── 更新 Job / Video.outputAssetId

AgentEngine / ModelRouter     不出现在 V1 渲染路径
workers/                      V1 不需要进程；表已按队列预备
```

---

## 25. 推荐最终目录结构（实现阶段再创建）

```
apps/backend/src/storage/
  storage.types.ts
  storage.service.ts
  local.storage-provider.ts

apps/backend/src/media/
  media.module.ts
  video-generation.service.ts
  job-runner.ts
  providers/
    video.provider.ts          // 接口
    mock.video-provider.ts
    tts.provider.ts            // 接口 only
    image.provider.ts
    subtitle.provider.ts
    compose.provider.ts

apps/backend/src/assets/
  assets.module.ts
  assets.controller.ts
  assets.service.ts
  assets.mapper.ts
  dto/

apps/backend/src/videos/
  videos.module.ts
  videos.controller.ts
  videos.service.ts
  videos.mapper.ts
  dto/

apps/backend/src/jobs/         // 可无独立 HTTP；供 Service 使用
  jobs.service.ts

database/prisma/migrations/20xxxxxx_add_media_asset_job_video/
```

不把 Storage 放进 `agents/`。不在 `scripts/` 里写文件。

Frontend（更后）：`app/dashboard/assets/`、`app/dashboard/videos/`、`app/dashboard/videos/[id]/`。

---

## 26. 建议错误码（实现时再写入 app-error.ts）

`ASSET_NOT_FOUND` `ASSET_CONFLICT` `ASSET_INVALID_FILE`  
`VIDEO_NOT_FOUND` `VIDEO_CONFLICT` `VIDEO_SCRIPT_NOT_CONFIRMED`  
`JOB_NOT_FOUND` `JOB_CONFLICT`

跨租户全部走 NOT_FOUND → 404。

---

## 27. 本 Step 声明

本 Step 没有修改业务代码、Schema、migration、API、Agent、Frontend，没有安装依赖，没有接 Redis/BullMQ，没有调用真实媒体 Provider。

仅新增本设计文档，并在 `docs/README.md` 增加索引。
