# Media / Asset 架构与 Video Generation 设计

状态：**仅设计，未实现。** 本文件不对应任何 Schema / API / Agent / Frontend 改动。

不接：FFmpeg、TTS、数字人、图片生成、字幕服务、Redis、BullMQ、抖音 API、真实视频模型、电视剧剪辑实现。

配套现状：[architecture.md](./architecture.md)、[database-architecture.md](./database-architecture.md)、[agent-engine.md](./agent-engine.md)、[script-generation-agent.md](./script-generation-agent.md)。

---

## 1. 当前系统分析（基于代码，非猜测）

### 1.1 已完成能力

| 模块 | 现状 |
| --- | --- |
| Auth / Tenant / Workspace / Project | 已实现。隔离根是 Tenant。查询带 `tenantId + workspaceId`，列表再带 `projectId`。跨租户 404。 |
| Agent Engine | 代码注册 Definition；`AgentEngine.execute()` **同步**创建 `AgentRun` 并跑完。 |
| ModelRouter | Agent 只经 `ModelRouter.generate()` 调 Mock / Real LLM。 |
| `account.positioning:v1` | 已实现 |
| `content.planning:v1` + ContentPlan | 已实现。Topic 在 JSONB，无 Topic 表。 |
| `script.generation:v1` + Script | 已实现。业务入口 `POST /scripts`，内部调 `AgentsService.execute()`。 |

已注册 Agent（`AgentRegistry`）：`system.echo`、`account.positioning`、`content.planning`、`script.generation`。  
无 `video.*`、无 `movie.editing`。

### 1.2 Script 当前字段（`schema.prisma`）

`id, tenantId, workspaceId, projectId, contentPlanId?, topicId?, title, content, version, status, payload, topicSnapshot, sourceAgentRunId?, createdAt, updatedAt, deletedAt`

- `sourceAgentRunId` **无外键**
- 业务状态：`DRAFT → CONFIRMED → ARCHIVED`（枚举仍保留历史 `GENERATING` / `READY`）
- 版本：`@@unique([tenantId, contentPlanId, topicId, version])`
- **没有** `audioAssetId` / `subtitleAssetId` / 任何文件字段

### 1.3 Script.payload（`ScriptOutput`）

```
title, hook, opening,
sections[{ sequence, narration, visualSuggestion, subtitle, duration }],
ending, cta, totalDuration, estimatedWordCount,
voiceStyle, visualStyle, productionNotes[]
```

这是文本合同，不是文件合同。`subtitle` / `visualSuggestion` / `narration` 都是字符串。设计原稿已写明：未来 Video 只读 `Script.payload`，不向前端再要一份旁白。

### 1.4 ContentPlan.payload（`ContentPlanOutput`）

```
title, summary, planningDays, postsPerDay, platform,
contentStyle?, additionalRequirements?,
pillarAllocation[], usedTrendData, trendNote, topics[]
```

Topic：`id, dayIndex, title, hook, contentPillar, targetAudience, painPoint, contentAngle, format, estimatedDuration, priority, reason, keywords[], cta, status, scheduledDate?`  
无文件、无 Asset、无 filePath。

### 1.5 AgentRun 当前结构

`id, tenantId, workspaceId, projectId, agentId, agentVersion, status, input, output, error, requestId, token 用量, startedAt, completedAt, createdAt, updatedAt`

- 无 `deletedAt`
- 无 Job / Queue 字段
- `input` / `output` 是 JSON（LLM 结构化结果）
- 查询：`findFirst({ id, tenantId, workspaceId })`，列表强制 `projectId`

### 1.6 隔离方式

所有业务表（Project / ContentPlan / Script / Video / Analytics / AgentRun）都有 `tenantId + workspaceId + projectId`。  
JWT 提供 `tid` / `wid`。客户端禁止传租户键。  
`Script.contentPlanId`、`Video.scriptId` 可选，**没有**与 `tenantId` 组成的复合外键；租户一致性靠应用层写入校验。

### 1.7 Agent 执行方式

```
POST /agents/runs 或业务 POST /scripts
  → AgentsService.execute()
  → AgentEngine.execute()   // 同步
  → AgentRun PENDING → RUNNING → COMPLETED | FAILED
  → InProcessAgentExecutor（或 AI_ENGINE_URL 时 AiEngineExecutor）
  → ModelRouter.generate()
```

`AgentEngine.enqueue()` 已预留，当前抛 `AGENT_ASYNC_NOT_IMPLEMENTED`（HTTP 501）。  
默认超时：多数 Agent 60s；内容规划 90s。HTTP 请求一直等到结束。

### 1.8 Media / Asset / 文件

**不存在** Asset 表、Storage 模块、上传 API、`fs` 封装。

唯一接近文件的是已有 **Video** 表（`init_core_schema` 起就有）：

```
id, tenantId, workspaceId, projectId, scriptId?,
filePath?, duration?, width?, height?,
status (PENDING|PROCESSING|COMPLETED|FAILED),
createdAt, updatedAt, deletedAt
```

注释写明：「只存路径 / storage key，不存二进制。」  
`AppModule` **没有** VideosModule。`apps/backend` / `apps/frontend` **没有** `/videos` API 或页面。  
`database/test/schema.test.ts` 用 `filePath: "s3://acf/videos/demo.mp4"` 和 `"local/demo.mp4"` 测外键，证明 Video 已被当成「路径容器」，但路径格式未统一。

### 1.9 Task / Job

**不存在** Job / Task 表。  
`workers/` 是空脚手架：`bootstrap()` 只打日志，**不连接 Redis、不注册队列**。`workers/package.json` 无 BullMQ 依赖。根 `package.json` 无 Redis / FFmpeg / TTS / 视频 SDK。

`auth-architecture.md` 文字里出现过 Task，**代码和 Prisma 都没有 Task 模型**。

### 1.10 与未来 Asset 层的冲突（必须正视）

| 冲突 | 说明 | 处理原则 |
| --- | --- | --- |
| `Video.filePath` | 把「成片业务对象」和「文件存储」焊在同一列 | **不要继续往 filePath 堆多文件。** 以后用 Asset + `outputAssetId`，filePath 废弃（迁移时拷到 Asset） |
| `Video.duration/width/height` | 文件属性，但成片列表也需要 | 权威在 Asset；Video 可冗余一份便于列表 |
| `VideoStatus` | 已是执行态（PENDING/PROCESSING/…），与 Script 的 DRAFT/CONFIRMED 不同 | **保留为成片生产生命周期**，不要改成 DRAFT。Job 另有自己的状态 |
| 无 Asset 时无法表达多文件 | 一个 Video 无法同时挂配音、字幕、封面、成片 | 引入 `Asset` + `AssetLink` |
| Agent 同步 + 60s 超时 | 视频生成通常数分钟 | **不要把视频渲染塞进 AgentRun.execute()**。Agent 最多出 JSON 计划；渲染走 Job |
| `Video.scriptId` 可空且无租户复合 FK | 与 Script.contentPlanId 同类 | 写入时应用层校验 tenant/workspace/project；查询禁止 `findUnique({id})` |
| Analytics → Video | 已按成片业务对象挂钩 | 保持。Analytics 不挂 Asset |

这些冲突 **不够大到要重构 Auth / Agent Engine / Script**。Asset 是增量层。Video 表保留，演进字段，不删表。

---

## 2. Asset 定义

Asset 是租户内一份**已存储文件**的元数据，不是「视频业务对象」，也不是 Job。

- 二进制只在对象存储（本地盘 / S3 兼容）
- Postgres 只存键与元数据
- 抖音成片与电视剧原片/切片共用这一层
- 业务代码禁止 `fs.writeFile` / 直接 SDK 上传

身份：`id`。定位：`tenantId + workspaceId + projectId + id`。  
存储身份：`(storageProvider, storageKey)`，**不是 URL**。

---

## 3. Asset 类型

```
enum AssetType {
  IMAGE
  VIDEO          // 生成片段、成片文件
  AUDIO          // 配音、BGM、音效
  SUBTITLE       // srt / vtt / ass
  DOCUMENT       // 文案附件、分析报告
  SOURCE_VIDEO   // 用户上传的电视剧/素材原片
  SOURCE_AUDIO   // 用户上传的原音轨
  OTHER
}
```

`SOURCE_*` 表示**来源原片**，与生成结果分开，避免「原片」和「成片」都叫 VIDEO 后在素材库里无法过滤。  
封面/缩略图用 `IMAGE`，角色靠 `AssetLink.role`，不单开 THUMBNAIL 类型。

---

## 4. Asset 状态

```
enum AssetStatus {
  UPLOADING    // 直传未完成
  READY        // 可被引用、可下载
  PROCESSING   // 转码 / 抽帧（可选）
  FAILED
}
```

删除用 `deletedAt`，不单独靠 `DELETED` 枚举（与现有 Script/Video 软删一致）。  
**Asset 状态 ≠ Video 状态 ≠ Job 状态**，见第 11 节。

---

## 5. 哪些字段进数据库

### 5.1 V1 必须进 Asset 表

| 字段 | 原因 |
| --- | --- |
| id | UUID v7 |
| tenantId / workspaceId / projectId | 与现有资源同一隔离键 |
| type / status | 列表筛选 |
| storageProvider / storageKey | 找文件；禁止只存 URL |
| mimeType / fileName / fileSize | 下载与配额 |
| duration / width / height | 视频/音频/图片列表；无则 null |
| metadata Json | 容器、fps、语言、checksum 等扩展，避免先加一堆列 |
| createdAt / updatedAt / deletedAt | 与现表一致 |

建议约束：`@@unique([id, tenantId])`，`@@unique([tenantId, storageProvider, storageKey])`，`@@index([tenantId, workspaceId, projectId, type])`。

### 5.2 不要作为 Asset 列

| 字段 | 放哪里 |
| --- | --- |
| videoUrl / cdnUrl / publicUrl | StorageService 临时签名，不持久化权威副本 |
| 文件二进制 | 对象存储 |
| scriptId / videoId | `AssetLink` |
| provider / model / generationConfig / error | Job |
| userId 当隔离键 | 隔离只用 tenant；`createdByUserId` 可 V2 审计 |
| audioAssetId 反写到 Script | Script 保持文本合同 |

V2 可加：`checksumSha256`、`createdByUserId`、`sourceJobId`。

---

## 6. Asset 与业务对象的关系

推荐：**业务对象 1 — N Asset**，中间表带角色。不要在 Script/Video 上堆 6 个 `*AssetId`。

```
Project
  ├── ContentPlan          （无 Asset）
  ├── Script               （无 Asset；payload 是文本）
  ├── Video                （成片业务对象）
  │     ├── outputAssetId? （快捷指向 FINAL，可空）
  │     └── AssetLink[]    （FINAL / VOICEOVER / SUBTITLE / COVER / BGM / CLIP…）
  ├── MovieEditingJob      （见 Job.kind，不是第二套文件系统）
  └── Asset                （素材库里的每一份文件）
```

`AssetLink`：

```
assetId
ownerType    // VIDEO | JOB | PROJECT
ownerId
role         // FINAL | COVER | THUMBNAIL | VOICEOVER | BGM | SUBTITLE | SOURCE | CLIP | REFERENCE
sortOrder
tenantId     // 冗余，查询必须带上
```

同一 Asset 可被多次链接（例如一条配音同时挂在 Video 和 Job 上）。禁止跨租户链接。

### A. Video 存 URL、assetId，还是多个 Asset？

**不要存 `videoUrl`。** URL 会过期、会换 CDN、无法表达多文件。

**要有一个 `outputAssetId`（最终成片快捷指针）+ 多个 AssetLink。**

只存一个 assetId 不够：配音、字幕、封面、中间片段都会丢。只存 filePath 是当前表的缺陷。

### B. Script 要不要 audioAssetId / subtitleAssetId？

**不要。** Script 是口播/分镜文本。配音和字幕是 **Video Job 的产物**。  
Script 再生成新 version 时旧音频会错位。TTS 失败也不该把 Script 打成 FAILED。

未来 Video 读取：`Script.payload.sections[].narration` / `subtitle` / `visualSuggestion` / `voiceStyle`。

### C. 一个 Video 能否有多份 Asset？

能，而且 V1 就按这个建模：

| role | 典型 type |
| --- | --- |
| FINAL | VIDEO |
| COVER / THUMBNAIL | IMAGE |
| VOICEOVER | AUDIO |
| BGM | AUDIO |
| SUBTITLE | SUBTITLE |
| CLIP | VIDEO |
| REFERENCE | IMAGE / VIDEO |

### D. 电视剧剪辑能否产生多份 Asset？

能，全部进同一 Asset 表：

| 产物 | type | role |
| --- | --- | --- |
| 上传原片 | SOURCE_VIDEO | SOURCE |
| 切片 | VIDEO | CLIP |
| 旁白/配音 | AUDIO | VOICEOVER |
| 字幕 | SUBTITLE | SUBTITLE |
| 封面 | IMAGE | COVER |
| 导出成片 | VIDEO | FINAL |

剪辑完成可再创建一条 `Video`（成片库），`scriptId` 为空，`AssetLink` 指向上述文件。  
**不要**为影视另建 `movie_files` 表。

AgentRun 不直接 FK 到 Asset。Job.output JSON 可记 asset id 列表；需要查询时用 AssetLink。

ContentPlan / Project 不挂文件。用户上传素材属于 Project 下的 Asset，`ownerType=PROJECT`。

---

## 7. StorageProvider

```
interface StorageObject {
  provider: string;
  key: string;
  size: number;
  mimeType?: string;
}

interface StorageProvider {
  readonly id: string; // 'local' | 's3' | ...
  put(key, body, opts): Promise<StorageObject>;
  get(key): Promise<Readable>;
  delete(key): Promise<void>;
  exists(key): Promise<boolean>;
  // V2
  getSignedUrl?(key, ttlSeconds): Promise<string>;
}

class StorageService {
  // 按 Asset.storageProvider 选 Provider
  // 业务只依赖 StorageService，禁止 fs / AWS SDK
}
```

Key 必须带隔离前缀，避免桶内串租：

```
tenants/{tenantId}/workspaces/{workspaceId}/projects/{projectId}/{assetId}/{filename}
```

| 阶段 | Provider |
| --- | --- |
| V1 | `LocalStorageProvider`（进程目录，如 `data/storage/`） |
| V2 | `S3CompatibleStorageProvider`（MinIO / S3 / R2 / OSS / COS 同一协议） |
| V3 | 多桶、生命周期、转码后另存 |

迁移：新建 Asset 写新 Provider；旧 Local 对象 copy/put 后改 `storageProvider + storageKey`。业务 API 不变。

---

## 8. VideoGenerationService 与调用链

名称保持 **`VideoGenerationService`**（抖音 Script → 成片）。电视剧用 **`MovieEditingService`**。二者共享 Asset / Storage / Provider，不共享 Prompt，不合成一个 Agent。

```
Agent（可选，只出 JSON 计划）
  → VideoGenerationService / MovieEditingService
      → StorageService
      → TtsProvider / ImageProvider / VideoProvider / SubtitleProvider / ComposeProvider
      → Asset 入库 + AssetLink
      → 更新 Job / Video
```

禁止：

- `ScriptsService` / Controller 直接调 FFmpeg 或视频 HTTP API
- Agent Executor 里 `fetch(videoVendor)`
- 把成片 URL 写进 AgentRun.output 当唯一真相

`video.generation:v1`（未来）只输出结构化计划（分镜、素材需求、TTS 文本）。真正渲染由 Service + Job 完成。这与现在 `script.generation` → 落 Script 行、Agent 不写业务表之外的文件，是同一分层。

建议接口（实现阶段再落地，此处只定形状）：

```
type CreateVideoFromScriptInput = {
  scriptId: string;
  // tenant/workspace/project 只来自 Auth + Script 行
};

interface VideoGenerationService {
  createFromScript(auth, input): Promise<{ video, job }>;
  get(auth, videoId): Promise<VideoPublic>;
}
```

能力覆盖（通过编排不同 Provider，而不是 10 个 Service）：

1. 文生视频 → VideoProvider
2. 图生视频 → ImageProvider + VideoProvider
3. Script → Video → 读 Script.payload + 编排 TTS/画面/合成
4. TTS → Video → TtsProvider + ComposeProvider
5. 多段合成 → ComposeProvider
6. 字幕 → SubtitleProvider
7. 配音 → TtsProvider
8. FFmpeg → ComposeProvider 的一种实现
9. 第三方视频 API → VideoProvider 实现
10. 本地模型 → 同接口另一实现

---

## 9. VideoProvider 与其它 Provider

不要做成一个万能 `VideoProvider` 包打 TTS/字幕。按能力拆，Router 选择实现。新增厂商 = 新 class + register，**不改** Agent Definition、不改 Controller、不改 Asset/Video 核心列。

```
interface VideoProvider {
  readonly id: string;
  readonly capabilities: Array<'text-to-video' | 'image-to-video' | 'clip-generate'>;
  generate(req: VideoProviderRequest): Promise<VideoProviderResult>;
}

interface TtsProvider { id; synthesize(req): Promise<{ audioKey }>; }
interface ImageProvider { id; generate(req): Promise<{ imageKey }>; }
interface SubtitleProvider { id; render(req): Promise<{ subtitleKey }>; }
interface ComposeProvider { id; compose(req): Promise<{ videoKey }>; }
```

`VideoProviderRequest` 含：`requestId`、隔离上下文（供日志，不写进厂商 payload 的 tenant 明文除非必要）、画面描述、时长、参考 Asset id。  
结果只返回 **storageKey + 技术元数据**，由 Service 创建 Asset。

未来实现（现在不要加代码）：

- LocalFfmpegComposeProvider
- 第三方视频 API VideoProvider
- 图片 API ImageProvider
- TTS API TtsProvider
- 字幕服务 SubtitleProvider
- 本地模型 Provider

V1 实现阶段可以用 `MockVideoProvider` / `MockComposeProvider` 写文件到 LocalStorage，保证链路可测。

---

## 10. AgentRun / Job / Task 如何区分

| | AgentRun | Job | Task |
| --- | --- | --- | --- |
| 现在 | 已有表，同步 LLM 执行 | **没有** | **没有**（文档用语，不要建表） |
| 职责 | 一次 Agent 调用的审计：input/output JSON、token、状态 | 一次**耗时媒体流水线**：排队、进度、Provider、产出 Asset | 不采用第三概念 |
| 时长 | 秒级，卡 HTTP | 分钟～小时，必须能脱离请求 | — |
| 失败 | Agent 错误码 | 渲染/存储/厂商错误 | — |
| 和 Video | Script 用 `sourceAgentRunId` | Video 用 `sourceJobId`（未来列） | — |

**最终建议：**

1. **不要建 Task 表。**
2. **保留 AgentRun** 给所有 Agent（含未来 `video.generation` 计划 Agent、`movie.editing` 分析 Agent）。
3. **新增一张 `jobs` 表**（实现阶段），用 `kind` 区分，而不是 `VideoGenerationJob` + `MovieEditingJob` 两张核心表。

```
Job.kind:
  VIDEO_GENERATION
  MOVIE_EDITING
  TTS
  SUBTITLE
  ASSET_INGEST   // 大文件上传后处理
```

```
Job.status: QUEUED | RUNNING | SUCCEEDED | FAILED | CANCELLED
```

字段建议：`tenantId, workspaceId, projectId, kind, status, scriptId?, videoId?, agentRunId?, requestId, input Json, output Json, error Json, progress Int, provider, model, createdAt, startedAt, completedAt`。  
`sourceAgentRunId` 风格：Job 不 CASCADE 删 Video/Asset。

异步边界：

```
今天（LLM）：
POST → execute() → AgentRun → 业务行

未来（媒体）：
POST /videos
  → 校验 Script CONFIRMED（或原片 Asset READY）
  → Video PENDING
  → Job QUEUED
  → 立即返回 Video + jobId
  → Worker（以后才接队列）跑 VideoGenerationService
  → Asset READY，Video COMPLETED
```

**本设计阶段不接 Redis/BullMQ。** 以后队列载荷必须带 `tenantId/workspaceId/projectId/userId/jobId`，与 `auth-architecture.md` 一致。  
在接入队列之前，实现阶段可以用进程内异步或同步 Mock，但 **HTTP 契约按 Job 来**：不要假装视频能在 60s Agent 超时里跑完。

不要把 AgentRun.status 扩展成 QUEUED 来代替 Job。媒体进度、重试、部分产物都不适合塞进 LLM Run。

---

## 11. Video 数据模型演进

现表已有：隔离键、`scriptId?`、`filePath?`、`duration/width/height`、`VideoStatus`、时间戳。**保留表，增量列，不重建。**

### V1 必须（实现视频时）

| 字段 | 说明 |
| --- | --- |
| 现有隔离键 + scriptId + status + 时间戳 | 不动名字 `scriptId`（不要改成 sourceScriptId） |
| `outputAssetId` | 最终成片 Asset，可空；无 FK 到跨租户风险时用应用层校验，或 `(outputAssetId, tenantId)` |
| duration / width / height | 继续冗余自成片 Asset，方便 `GET /videos` |
| `sourceJobId?` | 无 FK，同 Script.sourceAgentRunId |

`filePath`：停止写入。有旧测试数据则一次性迁到 Asset。列可先留着 V2 再 drop。

### V2

| 字段 | 说明 |
| --- | --- |
| `thumbnailAssetId?` | 列表封面快捷指针 |
| `aspectRatio?` | `9:16` / `16:9`，列表筛选 |
| `title?` | 默认可从 Script.title 拷 |

### V3

发布态、平台、外部 videoId（抖音）——**不要**和生成 status 混用。另开 `publishStatus` 或独立 Publish 记录。

### 绝对不要放进 Video 表

| 字段 | 应放 |
| --- | --- |
| storageKey / mimeType / fileSize / 多文件路径 | Asset |
| generationConfig / provider / model / 逐步日志 | Job |
| error 详情 | Job.error；Video 失败只靠 status=FAILED |
| narration / subtitle 文本 | Script.payload |
| views/likes | Analytics（已有） |

---

## 12. 生命周期为什么必须分开

```
Job:     QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED
Video:   PENDING → PROCESSING → COMPLETED | FAILED     （沿用现枚举）
Asset:   UPLOADING → READY | FAILED （PROCESSING 可选）
Script:  DRAFT → CONFIRMED → ARCHIVED
```

- Job 失败、Asset 已 READY：允许保留配音重试合成，不必删文件
- Video COMPLETED 后 Asset 仍可被素材库引用
- 软删 Video 不 CASCADE 删 Asset（Restrict + 应用层决定是否清存储）
- 不要用 AssetStatus=PROCESSING 表示「整条成片还在生成」

---

## 13. 电视剧剪辑如何复用 Asset

`movie.editing:v1` **独立 Agent**，不塞进 `script.generation` 或 `video.generation`。  
输入不是 ContentPlan Topic；输入是 **SOURCE_VIDEO Asset**（加可选用户要求）。  
输出是结构化剪辑决策 JSON（场景、选段、旁白建议），写入 AgentRun.output。  
真正切镜 / TTS / 合成走 `MovieEditingService` + `Job.kind=MOVIE_EDITING`。

```
上传原片 → POST /assets (SOURCE_VIDEO)
  → movie.editing:v1（可选，场景分析 JSON）
  → Job MOVIE_EDITING
      → clips / voiceover / subtitle / thumbnail / final 全部建 Asset
      → AssetLink 挂在 Job，完成后挂到一条 Video
  → 成片出现在同一 GET /videos 与素材库
```

边界（已在 script 设计原稿第 15 节确立，此处保持）：

| | script.generation | video.generation | movie.editing |
| --- | --- | --- | --- |
| 输入 | 定位 + Topic | CONFIRMED Script | 原片 Asset |
| 输出 | Script.payload | 成片 Video + Asset | 剪辑决策 + 成片 Video + Asset |
| 禁止 | FFmpeg、读素材路径 | 改账号人设、写 Topic | 写营销 Hook、依赖抖音规划 |

可复用：AgentRegistry、Engine、Run、ModelRouter、Asset、Storage、Job、Compose/TTS Provider。  
不可复用：抖音口播 Prompt、ContentPlan 依赖。

---

## 14. 多租户隔离

规则与现网完全一致：

1. Asset / Job / Video 写入时 `tenantId/workspaceId/projectId` **只来自 JWT + 已校验的 Project/Script/Asset 行**，不信任客户端。
2. 查询禁止 `findUnique({ id })` 再判断租户。必须 `findFirst({ id, tenantId, workspaceId, deletedAt: null })`，列表再加 `projectId`。
3. 跨租户：404。同租户无权限：403。
4. 引用 Asset 时校验 **同一** tenant + workspace + project，防止 Tenant A 的 Video 挂 Tenant B 的 assetId。
5. storageKey 含 tenantId；Worker 不得签发 JWT，载荷自带隔离键。
6. 下载走 Backend 鉴权后的签名 URL 或代理流，不把永久公网 URL 写进库。

越权场景：User B 拿 User A 的 asset UUID 调 `GET /assets/:id` → 因 where 含 B 的 tenantId → 404。  
伪造 `tenantId` 进 body → ValidationPipe `forbidNonWhitelisted`（现网已如此）。

权限：上传/生成走类似 `agent:execute` 或未来 `asset:write`；实现阶段再加 Permission，不要在 Controller 写 `role === OWNER`。

---

## 15. API 边界（不实现）

```
POST   /assets              上传或登记（用户素材、原片）
GET    /assets?projectId=   必填 projectId；可选 type/status
GET    /assets/:id
DELETE /assets/:id          软删；有 Video Restrict 则 409

POST   /videos              从业务对象创建生成任务
GET    /videos?projectId=
GET    /videos/:id
```

**用户不应「直接创建一条带 URL 的 Video」。**

推荐：

- 抖音链路：`CONFIRMED Script` → `POST /videos { scriptId }` → Service 建 Video+Job
- 影视链路：原片 Asset READY → `POST /videos { sourceAssetId, kind: 'MOVIE_EDITING' }` 或独立 `POST /movie-editing-jobs` 再产出 Video
- `POST /assets` 只负责文件进入素材库

可选以后：`GET /jobs/:id` 查进度。不要强迫前端自己调 `POST /agents/runs` 才生成视频（与 Script 主流程同一原则）。

---

## 16. 前端模块边界（不实现）

抖音生产：

```
账号定位 → 内容规划 → 脚本 → 视频制作 → 素材库 → 成片库
```

影视：

```
电视剧剪辑 → 上传原片 → AI 分析 → 自动剪辑 → 预览 → 导出
                 ↓                         ↓
              素材库                     成片库
```

建议路由（以后）：

| 路径 | 模块 |
| --- | --- |
| `/dashboard/assets` | 独立素材库 |
| `/dashboard/videos` | 成片列表/状态 |
| `/dashboard/videos/[id]` | 预览、关联脚本、失败信息 |
| `/dashboard/movie-editing` | 影视工作流 |

不要把素材管理塞进脚本页。不要在脚本页播 FFmpeg 进度。

---

## 17. V1 / V2 / V3（现在做什么）

| | 现在（本阶段） | 下一实现阶段 V1 | V2 | V3 |
| --- | --- | --- | --- | --- |
| 文档 | **本文件** | 按评审改文档 | | |
| Schema | 不改 | Asset + AssetLink + Job；Video 加 outputAssetId/sourceJobId | thumbnailAssetId、checksum、S3 字段 | 发布态、外部平台 id |
| Storage | 不实现 | LocalStorageProvider | S3 兼容 | 多存储迁移完成，drop filePath |
| 队列 | 不接 Redis | Job 表 + 契约；允许进程内/同步 Mock | BullMQ + workers/ | 重试、死信 |
| Video API | 无 | POST /videos from Script + Mock Provider | 真实视频/TTS Provider | 影视剪辑 API |
| Agent | 不新增 | 仍可不做 video Agent，Service 读 Script | `video.generation:v1` 计划 Agent | `movie.editing:v1` |
| FFmpeg / TTS / 抖音 | 禁止 | 禁止真实依赖 | 按需一个 Compose/TTS | 数字人、自动发布 |

**现在明确不做：** 改 Prisma、建表、写 API、写 Provider、装依赖、实现 Video。

---

## 18. 数据库建议（实现阶段，非现在）

1. 新建 `assets`、`asset_links`、`jobs`
2. `videos` 增加 `output_asset_id`、`source_job_id`；停止写 `file_path`
3. Tenant/Workspace/Project 增加 `assets` / `jobs` relation
4. **不删** Video、不改 Script/ContentPlan/AgentRun 核心列
5. 新 migration，禁止改历史 migration
6. `sourceJobId` / `sourceAgentRunId` 均无 FK（与现 Script 一致）

建议索引：Asset `(tenant_id, workspace_id, project_id, type)`；Job `(tenant_id, status)`、`(video_id)`。

---

## 19. 数据关系图

```
User ── Membership ── Tenant ── Workspace ── Project
                                      │
                    ContentPlan ──────┤
                    Script ───────────┤  payload 文本合同
                    AgentRun ─────────┤  LLM 审计
                    Job ──────────────┤  媒体流水线
                    Asset ────────────┤  文件元数据
                    Video ────────────┤  成片业务对象
                         │            │
                         ├── outputAssetId → Asset
                         ├── AssetLink → Asset（多角色）
                         └── Analytics
```

---

## 20. 抖音视频生产链路

```
account.positioning:v1
  → content.planning:v1 → ContentPlan CONFIRMED
  → script.generation:v1 → Script CONFIRMED
  → POST /videos { scriptId }
       → Video PENDING + Job VIDEO_GENERATION QUEUED
       → VideoGenerationService
            → 读 Script.payload
            → Tts / Image / Video / Subtitle / Compose Providers
            → Asset READY + AssetLink
       → Video COMPLETED，outputAssetId = FINAL
  → 前端成片库 / 素材库
```

---

## 21. 电视剧剪辑链路

```
POST /assets  SOURCE_VIDEO
  → movie.editing:v1（场景/选段 JSON）→ AgentRun
  → Job MOVIE_EDITING
       → MovieEditingService
            → CLIP / VOICEOVER / SUBTITLE / COVER / FINAL Assets
       → Video COMPLETED（scriptId 空）
  → 同一素材库与成片库
```

---

## 22. 对象存储迁移方案

1. V1 Local：`storageProvider='local'`，key 带 tenant 前缀  
2. V2 配置 S3 兼容端点，**新对象只写 S3**  
3. 后台拷贝：Local get → S3 put → 更新 Asset 两列 → 校验 checksum  
4. 切换默认 Provider；Local 只读一段时间  
5. 业务读写始终 `StorageService`，Controller / Agent 无感知  

MinIO / R2 / OSS / COS 都走 S3 兼容实现，不各写一套 Service。

---

## 23. 明确不做（本阶段与近期）

- 修改现有 Auth、Workspace、Project、Agent Engine、ModelRouter、ContentPlan、Script 生产逻辑  
- 为测试改生产代码  
- Topic 表、Redis、BullMQ、FFmpeg、TTS SDK、视频厂商 SDK  
- Script 上挂文件外键  
- 用 AgentRun 冒充长时间 Job  
- 第二套影视文件系统  
- 用户提交裸 `videoUrl` 创建成片  
