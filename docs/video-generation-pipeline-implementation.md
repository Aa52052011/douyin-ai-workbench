# Video Generation Pipeline 实现说明（Step 6.2）

状态：**已实现（Mock 媒体 Stage + Worker Lease）。**  
设计：[video-generation-pipeline-design.md](./video-generation-pipeline-design.md)  
未接：真实图像 / 视频 / 字幕 API、对象存储、movie.editing。可选本机 FFmpeg 成片，见 [ffmpeg-compose-implementation.md](./ffmpeg-compose-implementation.md)。可选 OpenAI-compatible TTS，见 [openai-compatible-tts-implementation.md](./openai-compatible-tts-implementation.md)。可选 MiniMax TTS，见 [minimax-tts-implementation.md](./minimax-tts-implementation.md)。

---

## 1. 生产链

```
POST /videos
  → CONFIRMED Script.payload
  → ProductionPlanBuilder
  → Video + Job（Job.input.productionPlan 只读快照）
  → enqueue({ jobId })

Worker
  → 隔离校验
  → 原子 claim（PENDING 或 stale RUNNING）
  → heartbeat
  → Visual → Voice → Subtitle → Compose（Asset READY）
  → finalizeJob（VIDEO_OUTPUT + Video + Job 同事务）
  → COMPLETED / FAILED
```

Controller / Worker 不直接调 Stage。Worker 只调 `VideoGenerationService.run`。

---

## 2. ProductionPlan

不是表、不是 Agent。TypeScript 类型：`VideoProductionPlan`。

- 创建时机：`POST /videos` / `POST /videos/:id/retry`，在入队前。
- 存放：`Job.input.productionPlan`。Job 开始后只读。
- 同 Job crash recovery 复用同一 Plan。
- 用户 Retry 用**当前** Script 重建**新** Plan，不复用 Job #1 中间 Asset。

Scene：`hook` / `opening` / 每个 section / `ending` / `cta` 各最多 1 镜（空文本跳过）。  
`sceneId` = `deterministicUuid(videoId, v1:kind:sourceSectionSequence:sequence)`。  
V1 `visualSourceType` 只执行 `COLOR_BACKGROUND`。

旁白：`hook + opening + sections[].narration + ending + cta`。

---

## 3. Stages 与 Asset

| Stage | Provider | Asset | AssetLink |
| --- | --- | --- | --- |
| Visual | 本地色板 PNG | `IMAGE` READY | `VIDEO_SOURCE` |
| Voice | `TtsProvider`（默认 `MockTtsProvider`；`MEDIA_TTS_PROVIDER=openai-tts` 或 `minimax-tts`） | `AUDIO` READY | `VIDEO_AUDIO` |
| Subtitle | `MockSubtitleProvider` | `SUBTITLE` READY（合法 SRT） | `VIDEO_SUBTITLE` |
| Compose | `MockComposeProvider` 或 `FfmpegComposeProvider` | `VIDEO` READY | （无 Link；Finalize 才写 `VIDEO_OUTPUT`） |

全部经 `StorageService` → `LocalStorageProvider`。禁止 Stage 直接写文件系统。

Asset.metadata：`jobId` `videoId` `stage` `generationVersion`；镜头另含 `sceneId` `sourceSectionSequence`。不含 Prompt / Secret。

---

## 4. Timeline

| 量 | 含义 |
| --- | --- |
| `Script.totalDuration` / Plan `targetDuration` | 目标 / 估算 |
| Voice `duration` | 配音时间轴事实（Mock：`ceil(chars / 8)`；真实 TTS：探测音频，禁止字数公式） |
| Compose `duration` | **成片事实** → `Video.duration`（Mock = voice duration） |

字幕 cue 按 scene `durationBudget` 缩放到 voice duration。禁止随机时间轴。

---

## 5. Job.progress / output.stages

| 节点 | progress |
| --- | --- |
| PENDING | 0 |
| claim / Plan ready | 5 |
| Visual | 30 |
| Voice | 55 |
| Subtitle | 70 |
| Compose | 95 |
| Finalize（同事务 COMPLETED） | 100 |

`Job.output.stages.{visual,voice,subtitle,compose}`：`status` `assetIds` `completedAt` `duration?`。  
预留 `usage`（Mock `estimatedCost = 0`）与 `timeline`。不含 Prompt / API Key / 完整堆栈。

状态仍是 `PENDING` `RUNNING` `COMPLETED` `FAILED` `CANCELLED`。无 `PROCESSING`。

---

## 6. Stage 幂等

检查 `Job.output.stages.*.assetIds` **不够**。重入必须同时满足：

- Asset 存在、`deletedAt = null`、`status = READY`
- `Storage.exists(storageKey)`

否则重新执行该 Stage。Provider 接收 `clientRequestId`（`{jobId}:{stage}:{generationVersion}`）。

---

## 7. Lease / Heartbeat / attempt

Migration：`20260831050000_add_job_worker_lease`。

| 列 | 含义 |
| --- | --- |
| `locked_at` | 本次 claim 时间 |
| `last_heartbeat_at` | 最近心跳 |
| `attempt` | 数据库 claim 次数（**不是** BullMQ `attemptsMade`） |

Claim：单条 `UPDATE ... WHERE PENDING OR (RUNNING AND heartbeat 过期)`，`attempt + 1`。禁止先 SELECT 再无条件 UPDATE。

配置（`.env.example`）：

- `JOB_LEASE_TIMEOUT_MS` 默认 `90000`
- `JOB_HEARTBEAT_INTERVAL_MS` 默认 `15000`

heartbeat 必须小于 lease，否则启动/claim 时配置错误。

Crash recovery 只针对 **RUNNING + stale lease**。  
COMPLETED / FAILED / CANCELLED **不会**自动 reclaim，也不会复活 FAILED Job。用户 Retry 仍是新 Job。

---

## 8. Crash recovery vs 用户 Retry

| | 同 Job crash | 用户 Retry |
| --- | --- | --- |
| Job | 同一行，reclaim | **新** Job |
| Plan | 原快照 | 按当前 Script 重建 |
| 中间 Asset | 校验后复用 | **不**复用 Job #1 |
| 失败中间 Asset | V1 保留，不立即删除 | 新 Job 全量重做 |

`__mock_fail__` / `__mock_fail_{visual,voice,subtitle,compose}__` 仅 Mock。`__mock_fail__` = compose 失败（前面 Stage Asset 可保留）。

---

## 9. API / Frontend

API 未新增 Stage 路由。Public DTO 不返回 `storageKey` / 绝对路径 / Secret。  
Frontend 未改；继续轮询 Job status / progress。

---

## 10. 下一阶段

不要自动进入。真实 Provider 前继续依赖 lease + Stage 幂等。禁止把安全性只建立在 BullMQ `jobId` 去重上。
