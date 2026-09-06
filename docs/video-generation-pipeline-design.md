# Video Generation Pipeline 设计

状态：**Step 6.2 已实现（Mock Pipeline + Lease）。**  
实现说明：[video-generation-pipeline-implementation.md](./video-generation-pipeline-implementation.md)。  
本文件保留设计合同。未接真实视频 / TTS / 图像 / 字幕 API、FFmpeg、对象存储。

依据：当前仓库稳定代码（2026-08-31 核查），以及 [media-asset-architecture.md](./media-asset-architecture.md)、[video-asset-implementation-design.md](./video-asset-implementation-design.md)、[media-asset-implementation.md](./media-asset-implementation.md)、[job-queue-worker.md](./job-queue-worker.md)。

文档与代码冲突时，**以代码为准**。冲突见第 1 节。

---

## 1. 当前代码核查

已读文档：`media-asset-architecture.md`、`video-asset-implementation-design.md`、`media-asset-implementation.md`、`job-queue-worker.md`、`architecture.md`、`database-architecture.md`。

已读代码：

| 区域 | 路径 |
| --- | --- |
| Schema | `database/prisma/schema.prisma` |
| Script | `apps/backend/src/scripts/**`、`script-generation.types.ts` |
| Video | `apps/backend/src/videos/**` |
| Asset | `apps/backend/src/assets/**` |
| Job / Queue / Worker | `apps/backend/src/jobs/**`、`workers/**` |
| Media | `apps/backend/src/media/**` |
| Agent | `apps/backend/src/agents/**`（协议未改，仅确认边界） |

### 1.1 实际对象

- **Script**：`payload` 存完整 `ScriptOutput`（`scripts.service` 写入 `payload: output`）。`content` 是 narration 拼接，供展示。
- **ScriptOutput 合同（禁止改）**：`title` `hook` `opening` `sections[]`（`sequence` `narration` `visualSuggestion` `subtitle` `duration`）`ending` `cta` `totalDuration` `estimatedWordCount` `voiceStyle` `visualStyle` `productionNotes[]`。
- **Video**：成片业务对象。`filePath` 保留不写。`outputAssetId` + `sourceJobId`。应用层不写 `PROCESSING`。
- **Asset / AssetLink**：文件唯一资源；角色含 `VIDEO_*` 与预留 `MOVIE_*`。
- **Job**：异步业务唯一事实来源。`kind` 已有 `VIDEO_GENERATION` `MOVIE_EDITING` `TTS_GENERATION` `SUBTITLE_GENERATION` `VIDEO_COMPOSE`。**没有** `IMAGE_GENERATION`。`status` 为 `PENDING` `RUNNING` `COMPLETED` `FAILED` `CANCELLED`（**无 PROCESSING / RETRYING**）。
- **VideoGenerationService**：Worker 内 `claim` → 一次 `MockVideoProvider.render` → 一个 VIDEO Asset + `VIDEO_OUTPUT` Link → Job COMPLETED。
- **VideoProvider**：`id` + `render({ requestId, storageKey, scriptId, targetDuration?, voiceStyle?, visualStyle?, aspectRatio?, resolution?, requirements? })`。**没有** `capabilities`。
- **TtsProvider / ImageProvider / SubtitleProvider / ComposeProvider**：仅薄接口（`media-provider.types.ts`），无实现、无 Module 注册、无编排。
- **MockVideoProvider**：写占位 `video/mp4` 字节；`requirements === '__mock_fail__'` 失败。**不读 Script.payload / sections**。
- **StorageService → LocalStorageProvider**：`put/get/delete/exists/getUrl`。Key：`v1/{tenantId}/{workspaceId}/{projectId}/{assetId}/{objectId}`。
- **JobQueue**：`enqueue(jobId)`。BullMQ payload **只有** `{ jobId }`。Queue 名 `acf-jobs`。
- **Worker**：`findUnique({ id })` 后隔离校验，再调 `VideoGenerationService`。不处理 JWT。
- **AgentRun**：LLM 审计（token / estimatedCost）。`Job.agentRunId?` 单向可选，无 FK。AgentRun 无 `jobId`。

### 1.2 当前 Mock Pipeline（事实）

```
POST /videos { scriptId, voiceStyle?, visualStyle?, aspectRatio?, resolution?, targetDuration?, requirements? }
  → Script CONFIRMED（findFirst id+tenantId+workspaceId）
  → Video PENDING + Job VIDEO_GENERATION PENDING
  → Job.input = 生成配置（不含 Script.payload 快照）
  → JobQueue.enqueue(job.id)
  → 立即返回 VideoPublic（嵌套 job）

Worker
  → MockVideoProvider.render(scriptId + config)
  → Storage.put 占位文件
  → Asset(VIDEO) + AssetLink(VIDEO_OUTPUT)
  → Video.outputAssetId / duration / width / height
  → Job COMPLETED
```

**缺口：** 没有 ProductionPlan、没有 Scene、没有 TTS/字幕/分镜 Asset、没有 Compose。Script 除 CONFIRMED 校验外，对成片内容无贡献。

### 1.3 文档与代码冲突（以代码为准）

| 文档说法 | 代码事实 | 本设计采用 |
| --- | --- | --- |
| Job 状态 PROCESSING / QUEUED | `JobStatus.RUNNING` | **RUNNING** |
| 队列 payload 应带 tenantId 等 | 只有 `{ jobId }`，Worker 重读 DB | **保持 { jobId }**，不改 Queue 协议 |
| VideoProvider 带 capabilities | 无此字段 | 设计补 capability，实现阶段再加 |
| storageKey `tenants/{id}/...` | `v1/{tenantId}/...` | **保持 v1 格式** |
| `video.generation:v1` 计划 Agent | 不存在 | V1 **不要**新 Agent；Plan 确定性构建 |
| Job.input 含 script 快照 | 只含 generation config | V1 起写入 ProductionPlan 快照 |
| Compose/TTS 接口已可用 | 仅类型，无实现 | 按阶段补 Mock，再接真实 |

职责边界保持不变：

```
AgentRun ≠ Job
PostgreSQL Job = 异步业务 SoT
BullMQ = Dispatch
Worker = 执行
Asset = 文件
Video = 成片业务对象
Script = 文案 / 生产意图
```

禁止：Task / VideoTask / QueueJob / MovieFile / MovieAsset 表。禁止把 movie.editing 并进 script.generation。

---

## 2. 当前 Mock Pipeline

见 1.2。本设计要把它升级为**可编排的多阶段生产链**，但 V1 实现仍可用 Mock Provider 写出真实中间文件。

---

## 3. ScriptOutput → ProductionPlan

`script.generation:v1` 合同冻结。禁止改成 `voiceover` / `fullVoiceover` / `visualPlan`。

**VideoProductionPlan 不是业务 Agent、不是用户可见实体、不建表。**

它是：

```
Script.payload          // ScriptOutput
+ Job.input 生成配置     // voiceStyle / visualStyle / aspectRatio / ...
+ 系统默认（fps、codec）
    ↓
ProductionPlanBuilder   // 纯函数 / 确定性
    ↓
VideoProductionPlan
```

规则：

- 覆盖项：请求里的 `voiceStyle` 覆盖 `payload.voiceStyle`，不回写 Script。
- `hook` / `opening` / `ending` / `cta`：V1 并入旁白时间线（见第 5 节），不发明新字段名替代 Script。
- `visualSuggestion` 原样进入 scene，另派生 `visualPrompt`（V1 规则拼接，不调模型）。
- `sections[].duration` 与 `totalDuration` 是**预算**，不是成片事实。
- Builder 失败（无 section、时长全 0）→ Job FAILED，不调 Provider。

---

## 4. ProductionPlan 数据合同

建议 TypeScript 形状（实现时再落地，**现在不加列**）：

```
VideoProductionPlan
  version: 1
  scriptId
  videoId
  scriptVersion                 // Script.version，用于幂等指纹
  aspectRatio                   // 默认 9:16
  resolution                    // 默认 1080x1920
  fps                           // 默认 30
  targetDuration                // 来自 Script.totalDuration 或请求覆盖
  voice:
    style                       // 覆盖后的 voiceStyle
    language                    // 默认 zh-CN
    speed                       // 默认 1
    text                        // 全片旁白拼接（hook+opening+sections+ending+cta）
  scenes[]: ProductionScene
  audio:
    backgroundMusic: 'none' | 'stock' | 'user'
    volume: 0.15
  subtitle:
    style: 'default'
    position: 'bottom'
    format: 'srt'
  output:
    format: 'mp4'
    codec: 'h264'
```

```
ProductionScene
  sceneId                       // 稳定 UUID，Builder 按 scriptId+sequence 派生或生成一次后写入 Plan
  sourceSectionSequence         // 对应 Script.sections[].sequence；hook/opening 用 0 或负数约定
  sourceKind: 'hook' | 'opening' | 'section' | 'ending' | 'cta'
  sequence                      // 时间线上的顺序 1..N
  narration
  subtitle                      // 字幕文本（来自 Script，不是时间轴文件）
  visualSuggestion              // 原文，禁止丢弃
  visualPrompt                  // V1 = style + suggestion 模板拼接
  visualSourceType              // 见第 6 节
  durationBudget                // 秒，来自 section.duration
  transition: 'cut' | 'fade'    // V1 只用 cut
```

### 存放位置比较

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| A. 只存 Job.input | 创建时就能快照；retry 可对比 | 执行结果（实际 duration、assetId）不该写回 input |
| B. 只存 Job.output | 适合阶段结果 | Job 未跑完时前端看不到计划 |
| C. Video JSON 列 | 详情页好查 | Video 会变成执行日志；要加列；与「成片业务对象」冲突 |
| D. 新表 | 可查询 Scene | 个人项目过重；本 Step 禁止建表 |
| E. 只运行时 | 实现快 | Worker 崩溃 / retry / 前端进度全部丢失 |

**最终推荐：A + B，不建表、不加 Video 列。**

- **Job.input.productionPlan**：enqueue 前或 Worker 开头写入，之后只读。
- **Job.output.stages / assets / usage / timeline**：阶段结果与用量。
- Script.payload 仍是文案真相；Plan 是某次 Job 的生产快照。同一 Script 可有多条 Video / 多个 Plan。

---

## 5. Scene / Segment 模型

一条 15–60 秒抖音：`Script.sections[]` → `ProductionScene[]`。

**V1：一对一（外加 hook/opening/ending/cta 各最多 1 个 Scene）。**

- 不把 5 秒 narration 拆成 1A/1B/1C。
- `sceneId` 稳定：建议 `plan` 内生成一次后固定；同 Job 重入必须复用。
- `sourceSectionSequence` 保留溯源。

**V2：允许 1 section → N scene**（`sceneId` + `sourceSectionSequence` + `splitIndex`）。不要现在建 `VideoScene` 表。

| | ProductionPlan.scenes[] | VideoScene 表 |
| --- | --- | --- |
| V1 短视频 4–8 镜 | 足够 | 过度 |
| 查询「某 scene 的 Asset」 | Asset.metadata.sceneId + AssetLink | 方便但要 migration |
| movie.editing 上百 clip | V3 再评估表 | 那时才有查询压力 |

**V1 不建 VideoScene 表。** 理由：镜头数少；Asset + Link + Job.output 已能表达；避免未验证的表结构锁死 movie.editing。

---

## 6. VisualSourceType

| 类型 | 含义 | V1 | V2 |
| --- | --- | --- | --- |
| COLOR_BACKGROUND | 纯色/渐变底板 + 字幕 | **是** | |
| TEXT_TO_IMAGE | 文生图，静止镜 | **接口 + Mock** | 真实 ImageProvider |
| GENERATED_IMAGE | 已有生成图（复用） | 复用 Asset | |
| USER_ASSET | 用户上传图/视频 | 可选挂 Link | 常用 |
| TEXT_TO_VIDEO | 文生视频 | 否 | 可选 |
| IMAGE_TO_VIDEO | 图生视频 / Ken Burns | 否 | 优先于 TTV |
| STOCK | 库存 | 否 | |
| SOURCE_VIDEO | 原片（影视） | 否（movie） | movie.editing |
| COLOR_BACKGROUND | （上表） | | |

V1 默认：`COLOR_BACKGROUND`。有 `visualSuggestion` 时仍先出底板，`visualPrompt` 留给 V2 生图。不要假设全片 TTV。

---

## 7. Provider Capability

现状：`VideoProvider` 无 capabilities；其余 Provider 只有 `id` + 一个方法。

设计（实现阶段加只读字段，**禁止**业务 `if (provider === 'kling')`）：

```
capabilities: {
  textToVideo?: boolean
  imageToVideo?: boolean
  textToImage?: boolean
  tts?: boolean
  voiceClone?: boolean
  subtitle?: boolean
  compose?: boolean
  timestamps?: boolean      // TTS 是否给出词级/句级时间
  async?: boolean           // 是否返回 providerTaskId
  cancel?: boolean
}
```

业务只问：`router.pick({ need: 'tts', timestamps: false })`。V1 Router = 配置的默认 Mock / 单一实现。

---

## 8. Provider Orchestration

禁止 `SuperVideoProvider.generateEverything()`。

```
VideoGenerationService.run
  → ProductionPlanBuilder
  → VisualGenerationStage
  → VoiceGenerationStage
  → SubtitleStage
  → CompositionStage
  → 绑定 VIDEO_OUTPUT + 更新 Video
```

| 放哪 | 结论 |
| --- | --- |
| VideoGenerationService 内部阶段类 | **V1 推荐**。同一 Job、同一事务边界习惯、测试简单 |
| 独立 Nest Service（无独立 Job） | 可以，但是阶段类即可，不必先拆 Module |
| 每个 Stage 一个 Job | V1 否（见第 9 节） |

Controller / VideosService / MockVideoProvider **不**编排阶段。Worker 仍只调 `VideoGenerationService.run`。

未来 `MovieEditingService` 复用 Stage 接口与 Compose/TTS，不复用 Script Builder。

---

## 9. Job 粒度

| | A. 一条 VIDEO_GENERATION | B. 父 Job + 子 Job | C. DAG / Workflow 引擎 |
| --- | --- | --- | --- |
| 复杂度 | 低 | 中（状态机、孤儿子 Job） | 高 |
| 失败恢复 | Job.output checkpoint | 子 Job 独立 retry | 强但过重 |
| 用户 Retry | 已有：新父 Job | 要定义「重跑哪个子」 | 同 |
| 进度 | 阶段权重写 progress | 聚合子进度 | 强 |
| 成本 | output.usage | 按子 Job 加总 | 同 |
| Worker | 现有一条队列 | 多 kind 消费 | 新框架 |
| movie.editing | 同样一条 MOVIE_EDITING | 可共用子 kind | 过早 |

`JobKind` 已预留 TTS / SUBTITLE / COMPOSE，**留给 V3 拆子 Job**，不是 V1 义务。

**V1 最终：方案 A。** 一条 `VIDEO_GENERATION`，内部跑完 Visual / Voice / Subtitle / Compose。个人项目优先可靠，不引入 DAG。

---

## 10. Asset / AssetLink

| 产物 | AssetType | 建议 Role（现有优先） | metadata |
| --- | --- | --- | --- |
| 镜头图 | IMAGE | 无 SCENE role → **先用 VIDEO_COVER 不合适**；V1 用 metadata + 现有 role 不够时挂 `VIDEO_SOURCE` 或只挂 jobId | `{ sceneId, stage: 'visual' }` |
| 镜头视频 | VIDEO | `VIDEO_SOURCE` | `{ sceneId }` |
| 配音 | AUDIO | `VIDEO_AUDIO` | `{ stage: 'voice' }` |
| BGM | AUDIO | `VIDEO_BGM` | |
| 字幕文件 | SUBTITLE | `VIDEO_SUBTITLE` | `{ format: 'srt' }` |
| 预览 | VIDEO / IMAGE | `VIDEO_PREVIEW` | |
| 成片 | VIDEO | `VIDEO_OUTPUT` + `outputAssetId` | |

现有 Role **成片级够用，镜头级不够**。未来可加（**本 Step 不改 enum**）：

`VIDEO_SCENE_IMAGE` `VIDEO_SCENE_CLIP` `VIDEO_VOICE_SEGMENT`

V1 不改 enum：中间文件 `AssetLink.jobId` + `sortOrder` + `Asset.metadata.sceneId`；成片仍必须 `VIDEO_OUTPUT`。

movie 继续用 `MOVIE_*`，不混用 VIDEO_OUTPUT 当剪辑输出（剪辑完成若入库成片库，再挂一条 Video + VIDEO_OUTPUT）。

---

## 11. TTS

```
TtsProvider.synthesize({
  text, voice, language, speed, storageKey
}) → { storageKey, duration, mimeType, timestamps? }
```

输出：`Asset(AUDIO)` + `VIDEO_AUDIO`。`duration` 必填。

**词级 / 段级 timestamps：**

- 对字幕对齐很重要。
- **V1 不要求。** 多数便宜 TTS 没有稳定词级时间。
- 无 timestamps：按 `ProductionScene.durationBudget` 比例切 SRT（见第 12 节）。
- V2：若 `capabilities.timestamps`，用句级时间重写 SRT。

V1 一条全片音频（一次合成 `voice.text`），不做逐 scene 多段（减少调用与计费）。V2 可按 scene 分段以便局部重试。

---

## 12. Subtitle

**字幕文本 ≠ 字幕时间轴文件。**

```
Script.sections[].subtitle  (+ hook/opening/ending/cta 文本)
  → SubtitleStage
  → SRT 字节
  → Storage
  → Asset(SUBTITLE) + VIDEO_SUBTITLE
```

| 格式 | 优点 | 缺点 |
| --- | --- | --- |
| **SRT** | 简单、FFmpeg 友好、易测 | 无样式 |
| VTT | Web 播放器友好 | 与 FFmpeg 组合略繁 |
| ASS | 样式强 | V1 过重 |

**V1 内部标准：SRT。** 无 timestamps 时：

```
累计 durationBudget 得到 cue start/end
文本 = section.subtitle（空则回退 narration）
最后一条 end = min(累计, 实际 voice.duration 或 targetDuration)
```

禁止把 SRT 当 Script 合同的一部分。

---

## 13. Visual Generation

```
visualSuggestion + visualStyle + productionNotes
  → VisualPrompt（V1：模板字符串，确定性）
  → VisualGenerationStage
  → COLOR_BACKGROUND 文件或 IMAGE Asset
```

**V1 不要把 visualSuggestion 直接打给视频大模型。**  
**V1 不要新开 `video.visual-planning:v1`。**  
若 V2 要用 LLM 润色 Prompt：必须走 Agent Engine / ModelRouter，禁止业务 `fetch(Router One)`。

---

## 14. Composition

```
ComposeProvider.compose({
  storageKey,                    // 成片目标 key
  scenes: [{ assetId | storageKey, duration, transition }],
  voiceAsset?,
  subtitleAsset?,
  bgmAsset?,
  resolution, fps, aspectRatio
}) → { storageKey, duration, width, height }
```

业务只依赖 `ComposeProvider`。未来：`FFmpegComposeProvider`（本地或 Worker 机）、`CloudComposeProvider`。本设计不安装 FFmpeg、不锁 GPU。

V1 Mock Compose：按 plan 写出可识别的 mp4 占位（或拼接已有 scene 字节），**必须**经 StorageService，且 duration 取自 timeline 计算结果。

---

## 15. Timeline

必须统一，避免「视频 30s / 配音 37s / 字幕 35s」。

| 量 | 权威 | 说明 |
| --- | --- | --- |
| `Script.totalDuration` / `targetDuration` | **目标 / 估算** | 不是成片事实 |
| `section.duration` / `durationBudget` | **镜头预算** | Builder 用 |
| TTS `duration` | **配音轨事实** | 合成后写入 output |
| SRT cue | **派生** | 预算比例或 TTS timestamps |
| Compose 输出 duration | **成片事实** | 写入 `Video.duration` 与 OUTPUT Asset |
| `Video.duration` | **成片冗余** | 等于 OUTPUT Asset.duration |

V1 对齐策略（简单）：

1. 以配音时长为时间轴主轴（有 TTS 时）。
2. 画面按 budget 缩放，使 Σ sceneVisual ≈ voiceDuration。
3. 无 TTS 时主轴 = Σ durationBudget，上限 targetDuration。
4. Compose 完成后以**实际输出**回写 Video，不倒写 Script。

---

## 16. Progress

不假装 1% 精度。阶段权重写入 `Job.progress`（0–100）。**不改 JobStatus。**

| 阶段 | 权重 | progress 约 |
| --- | --- | --- |
| PLAN | 10 | 10（claim 后已是 10） |
| VISUAL | 25 | 35 |
| VOICE | 20 | 55 |
| SUBTITLE | 10 | 65 |
| COMPOSE | 25 | 90 |
| FINALIZE | 10 | 100 |

`Job.output.currentStage` 供详情页。阶段内不细分。

---

## 17. Failure Recovery

10 个 Scene、第 9 个失败：

- **V1：整 Job FAILED，用户 Retry 创建新 Job，默认全部重做。** 简单、无半成品状态机。
- 已成功的中间 Asset **保留**（不删），但不自动复用。
- V2：新 Job 读取旧 Job.output，按 `planFingerprint + sceneId + stage` 复用 READY Asset。

TTS 成功、Compose 失败：

- V1：Retry 重做 TTS（可接受；便宜且实现简单）。
- V2：复用 `VIDEO_AUDIO`。

Storage 成功、DB 失败：保持现网 orphan 策略（删对象或 `Job.error.orphanKey`），日志不打完整 storageKey。

---

## 18. Retry

保持 Step 4.2 / 5：

- 用户 `POST /videos/:id/retry` → **新 Job 行**，不复用 FAILED Job。
- COMPLETED 且已有 OUTPUT → `VIDEO_CONFLICT`；再生成走 `POST /videos`。
- 无 `RETRYING` 状态。
- 同一 Job 的 Worker / BullMQ 技术重试 ≠ 业务 Retry。技术重试必须走第 19 节幂等，禁止重复计费。

---

## 19. Idempotency

计费风险：**高优先级**（真实 Image / TTS / TTV）。

键：

```
jobId + sceneId + stage + generationVersion
```

`generationVersion` = `hash(script.version + productionPlan 关键字段)`。

Worker 重入（崩溃后 RUNNING 回收、BullMQ attempts）：

1. 读 `Job.output.stages[stage]`。
2. 若已有 `assetId` 且 Asset READY 且 `exists(storageKey)` → **跳过 Provider**。
3. 否则才调用。
4. Provider 侧若支持 `clientRequestId`，传入 `jobId:sceneId:stage`。

用户新 Job：新 jobId，V1 不复用（第 17 节）。幂等只保护**同一 Job 重复执行**。

现有 HTTP 幂等（`x-idempotency-key`）继续：同一 key 返回同一 Video / Job，enqueue 用同一 jobId。

---

## 20. Provider Usage / Cost

AgentRun 已有 token / estimatedCost。媒体没有 token。

V1 只写 `Job.output.usage`：

```
{
  imageCount, videoSeconds, audioCharacters, audioSeconds,
  computeSeconds, estimatedCost, providerCalls[]
}
```

`providerCalls[]`：`{ providerId, stage, count }`，**禁止**存 API Key、完整 Prompt、原始 response。

**不要 Usage 表。** V3 计费再拆。

---

## 21. Provider Routing

未来 `ProviderRouter.pick({ capability, prefer? })`。

维度：capability、availability、cost、quality、latency、user preference。

**V1：环境默认 + Mock。** 不写厂商 if/else。不实现自动选路。

---

## 22. Async Provider

真实视频常：`POST → providerTaskId → poll → download`。

| | 优点 | 缺点 |
| --- | --- | --- |
| A. Worker 内轮询数分钟 | 实现快 | 占并发；与「Worker 不无限占住」冲突 |
| B. BullMQ delayed job | 复用现队列；payload 仍只有 jobId | 要能从 RUNNING 再入阶段（靠 output checkpoint） |
| C. Webhook | 省轮询 | 本地开发难；要验签；厂商不统一 |
| D. ProviderTask 表 | 清晰 | 本阶段禁止新表；第二套状态风险 |

**V1 推荐 B：** 短同步（TTS/图/Compose Mock）直接做完；若某 Provider `async`，写 `output.providerTaskId`（非敏感）后 `enqueue` delayed（仍 `{ jobId }`），Worker 重入走幂等。单次 Worker 占用秒级 poll 上限（如 15s），超时则 delayed 再来。  
Webhook = V2。不要 ProviderTask 表。

第三方结果 URL **不是**永久地址：下载 → `StorageService.put` → Asset。

---

## 23. Worker Crash Recovery

已知限制：`RUNNING` 时崩溃不会自动回收；再投递会因 status≠PENDING 而 skip。

**真实 / 付费 Provider 之前必须解决。列为 Step 6.2 必做，不要等到 Step 7。**

建议（实现阶段再 migration，本 Step **不改 Schema**）：

```
Job.lockedAt
Job.lockOwner          // worker instance id
Job.lastHeartbeatAt
Job.attempt
```

算法：

1. claim：`PENDING → RUNNING` 且写入 lock + heartbeat（已有 claim 可扩展）。
2. Worker 每 N 秒更新 `lastHeartbeatAt`。
3. 回收器 / 下次 enqueue：`RUNNING` 且 `now - lastHeartbeatAt > lease` → 视为死亡，**保持 RUNNING 或回到可执行**，increment attempt，再 enqueue 同一 jobId。
4. 重入走第 19 节幂等，不重复打 Provider。

不要用「直接改回 PENDING」而不带 attempt：会丢失「已 claim」语义。更稳：`RUNNING + stale lock → 允许同一 process() 继续`。

Step 7 再考虑多 Worker 租约调优。V1 单并发也可先做 stale lease。

---

## 24. Cancellation

当前无 `POST /videos/:id/cancel`（V2 API）。设计语义，不实现：

- Video 非 COMPLETED 才可取消。
- Job → `CANCELLED`；若 RUNNING，设 `cancelRequested`（可用 output 标志，免新列）或 V2 列。
- BullMQ：`queue.remove(jobId)`；已 active 则等当前阶段边界检查标志后退出，**不** `process.exit`。
- Provider `capabilities.cancel` 则尽力 cancel；不支持则等当前调用结束。
- 已生成中间 Asset：**保留**（审计 / 计费）。不成片、不写 VIDEO_OUTPUT。
- 无法打断的长调用：结束后发现取消 → Job CANCELLED，不绑定 OUTPUT。

---

## 25. Video Status

**不改 enum。** 应用层继续不写 `PROCESSING`。

| 阶段 | Job.status | Video.status |
| --- | --- | --- |
| 已创建未跑 | PENDING | PENDING |
| Worker 执行各 Stage | RUNNING | PENDING |
| 成功 | COMPLETED | COMPLETED |
| Provider / 隔离 / enqueue 失败 | FAILED | FAILED（无 OUTPUT） |
| 未来取消 | CANCELLED | FAILED 或保持 PENDING（V2 定；建议 FAILED 不展示假完成） |

Job = 执行态。Video = 成片业务态。进度只看 Job.progress / currentStage。

---

## 26. Frontend

只设计。详情可展示：Plan 摘要、scenes（sequence / 文本 / visualSourceType）、各 stage 状态、progress、OUTPUT Asset、`error.code`。

**禁止展示：** API Key、Internal Secret、完整 Prompt、`visualPrompt` 全文（可截断）、Provider raw response、`MEDIA_STORAGE_ROOT`、真实磁盘路径、Redis URL。

继续 `GET /videos/:id` 轮询，不要 WebSocket / SSE。

---

## 27. Movie Editing Reuse

```
SOURCE_VIDEO → 分镜检测 → Clip Assets → 旁白 → TTS → Subtitle → Compose → Final Video
```

共享：**Asset、Storage、Job、ComposeProvider、TtsProvider、SubtitleProvider、Timeline、幂等键、lease。**

不共享：`ProductionPlanBuilder`（它绑定 ScriptOutput）、`script.generation`、同一 Agent。

`movie.editing:v1` 保持独立 Agent（分析 / 剪辑意图 JSON）。`MovieEditingService` 平行于 `VideoGenerationService`。`Job.kind = MOVIE_EDITING`。Role 用 `MOVIE_*`。不建 MovieFile。

---

## 28. V1 / V2 / V3

| | V1（本设计落地后的第一实现波） | V2 | V3 |
| --- | --- | --- | --- |
| Plan | Builder + Job.input/output | 可人工改 Plan | — |
| Scene | JSON 一对一 | 1 section → N | VideoScene 表（若需要） |
| Visual | COLOR_BACKGROUND + Mock 图 | TEXT_TO_IMAGE / I2V | TTV / STOCK |
| Voice | Mock 或单一 TTS | timestamps | 克隆 |
| Subtitle | SRT 比例轴 | TTS 对齐 | ASS |
| Compose | Mock ComposeProvider | FFmpeg | 云合成 |
| Job | 单 VIDEO_GENERATION | checkpoint 复用 Asset | 子 Job |
| Crash | lease / heartbeat | 调优 | — |
| Router | 默认 | capability 选择 | 成本路由 |
| 存储 | LocalStorage | S3 兼容 | 多桶 |

---

## 29. 风险清单

| 风险 | 级别 | 缓解 |
| --- | --- | --- |
| 重复调用付费 Provider | 高 | 阶段幂等 + lease 先于真实 API |
| RUNNING 卡死 | 高 | Step 6.2 heartbeat |
| 音画轴漂移 | 高 | 第 15 节权威源 |
| 把 Script 改成另一套字段 | 高 | 合同冻结 |
| 过早 TTV / 多 Job DAG | 中 | V1 方案 A + COLOR_BACKGROUND |
| Provider URL 当永久地址 | 中 | 必须归档 Storage |
| Worker 长轮询占死 | 中 | delayed job |
| Prompt / Key 进 Job.error | 中 | 只存 code + 短 message |
| 建 Scene 表后难改 | 中 | V1 JSON |
| movie 与抖音 Pipeline 耦死 | 中 | 只共享基础设施 |

---

## 30. 推荐 V1 Pipeline

```
Script (CONFIRMED, payload=ScriptOutput)
  → ProductionPlanBuilder                    // 无 AI
  → Job.input.productionPlan
  → VisualGenerationStage                    // COLOR_BACKGROUND，产出 IMAGE Assets
  → VoiceGenerationStage                     // TtsProvider（V1 Mock），AUDIO + VIDEO_AUDIO
  → SubtitleStage                            // SRT，SUBTITLE + VIDEO_SUBTITLE
  → CompositionStage                         // ComposeProvider（V1 Mock）
  → Asset VIDEO + VIDEO_OUTPUT
  → Video.duration = 成片事实
  → Job COMPLETED
```

| 步 | 输入 | 输出 | AI | Asset | 失败 | 重试 |
| --- | --- | --- | --- | --- | --- | --- |
| Plan | Script.payload + Job.input config | productionPlan | 否 | 否 | Job FAILED | 新 Job 重建 |
| Visual | plan.scenes | 每 scene IMAGE | 否（V1） | 是 | Job FAILED | 新 Job 全重做 |
| Voice | plan.voice.text | 1 AUDIO | TTS Provider | 是 | Job FAILED | 新 Job 全重做 |
| Subtitle | plan + voice.duration | 1 SRT | 否 | 是 | Job FAILED | 新 Job 全重做 |
| Compose | 上述 Asset + plan.output | 1 VIDEO | 否 | 是 | Job FAILED | 新 Job 全重做 |
| Finalize | compose 结果 | outputAssetId | 否 | Link | 见 orphan | — |

同一 Job 技术重试：跳过已 READY 的 stage（第 19 节）。

---

## 31. 推荐 Step 6.2

**不要**一次接入真实视频模型、图片模型、TTS、FFmpeg、对象存储。

Step 6.2 最小闭环（仍全部 Mock 媒体，但 **Pipeline 为真**）：

1. **Worker lease / heartbeat**（小 migration：`lockedAt` `lastHeartbeatAt` `attempt` 或等价）。没有这项禁止接付费 API。
2. **ProductionPlanBuilder**：消费现有 ScriptOutput，写入 `Job.input.productionPlan`。
3. **四阶段 Mock**（Tts / Visual / Subtitle / Compose）：各写真实文件、建 Asset、挂 Link；Compose 产出 VIDEO_OUTPUT。
4. **阶段进度 + Job.output.stages / usage 骨架**。
5. **同 Job 重入幂等测试**（第二次 process 不重复 put）。
6. 回归：Auth / Script / 现有 POST /videos 异步行为。`__mock_fail__` 可挂在某一 stage。

**明确不做：** 真实厂商 SDK、FFmpeg npm、S3、`video.visual-planning:v1`、movie.editing、VideoScene 表、子 Job、WebSocket、改 ScriptOutput、改 Queue payload。

更后面的「第一段真实媒体」（建议 Step 6.3，非现在）：**单一 TTS + SRT + FFmpeg 色板/静帧合成**。比 TTV / I2V 更便宜、更好测。顺序优于文生视频。

---

## 32. 推荐目录结构

实现阶段再加，本 Step 不建文件：

```
apps/backend/src/videos/
  video-generation.service.ts          // 编排入口（已有，扩展）
  pipeline/
    production-plan.types.ts
    production-plan.builder.ts
    timeline.ts
    stages/
      visual.stage.ts
      voice.stage.ts
      subtitle.stage.ts
      compose.stage.ts

apps/backend/src/media/providers/
  video.provider.ts                    // 已有
  mock-video.provider.ts               // 过渡期可留作 Compose/整片 fallback
  mock-tts.provider.ts
  mock-image.provider.ts
  mock-subtitle.provider.ts
  mock-compose.provider.ts
```

`workers/` 仍只 bootstrap，不复制 Pipeline。

---

## 33. 最终架构图

```
Frontend
   ↓  POST /videos  { scriptId, config }
Backend (Auth / Authorization)
   ↓
VideosService
   创建 Video PENDING + Job VIDEO_GENERATION
   JobQueue.enqueue({ jobId })
   立即返回
        │
        ▼
Redis / BullMQ          ≠ 业务状态
        │
        ▼
Worker
   findUnique(Job)
   租户校验
   VideoGenerationService
        │
        ├─ ProductionPlanBuilder ← Script.payload (ScriptOutput 原合同)
        ├─ VisualStage  → Image Assets
        ├─ VoiceStage   → Audio Asset
        ├─ SubtitleStage→ Subtitle Asset
        └─ ComposeStage → Video Asset + VIDEO_OUTPUT
              │
              ▼
         StorageService → LocalStorage (V1)
              │
              ▼
         PostgreSQL Job / Video / Asset / AssetLink   ← SoT
```

未来 movie.editing：平行的 MovieEditingService，汇入同一 Storage / Compose / Job。

```
本地桌面：UI、上传下载、轻处理
云端：重 AI Provider
FFmpeg：本地或 Worker 或云，一律 ComposeProvider
```

---

## 34. Step 6.2 前必须 / 可延后

| 必须在付费 Provider 之前（建议 6.2） | 可等 Step 7+ |
| --- | --- |
| lease / heartbeat | 子 Job |
| ProductionPlan + 阶段编排 | 真实 TTV |
| 同 Job 幂等 checkpoint | ProviderRouter 智选 |
| 第三方 URL 归档原则（代码落地时遵守） | Webhook |
| | VideoScene 表、cancel API、FFmpeg、S3 |

本设计不修改业务代码、Schema、migration、API、Agent、Frontend，不安装依赖，不调用真实媒体 Provider。
