# Real Media Provider Readiness 设计

状态：**设计文档。** Finalize 一致性已在 Step 6.4 落地，见 [video-finalization-consistency-implementation.md](./video-finalization-consistency-implementation.md)。其余真实 Provider 项仍未实现。  
禁止在未评审的范围内改 Schema / 接收费 API / 安装 FFmpeg。

依据：仓库稳定代码（2026-08-31 核查）以及 [video-generation-pipeline-implementation.md](./video-generation-pipeline-implementation.md)、[video-generation-pipeline-design.md](./video-generation-pipeline-design.md)、[job-queue-worker.md](./job-queue-worker.md)、[media-asset-implementation.md](./media-asset-implementation.md)。

文档与代码冲突时，**以代码为准**。

---

## 1. 当前 Step 6.2 代码核查

已读文档：`video-generation-pipeline-design.md`、`video-generation-pipeline-implementation.md`、`job-queue-worker.md`、`media-asset-implementation.md`、`architecture.md`、`database-architecture.md`。

已读代码：`database/prisma/schema.prisma`、`apps/backend/src/videos/**`、`apps/backend/src/videos/pipeline/**`、`apps/backend/src/jobs/**`、`apps/backend/src/media/**`、`apps/backend/src/assets/**`、`workers/**`。

### 1.1 代码事实（不要用旧设计段覆盖）

| 对象 | 实际行为 |
| --- | --- |
| `ProductionPlanBuilder` | 纯函数。读现有 `ScriptOutput`。`sceneId = deterministicUuid(videoId, v1:kind:seq:sequence)`。`generationVersion` = 内容指纹（sha256 截断）。`plan.version` 固定 `1`。 |
| `VideosService.create/retry` | 入队前构建 Plan，写入 `Job.input.productionPlan`。Retry 建**新** Job + **新** Plan，不复用旧中间 Asset。 |
| `VideoGenerationService` | Orchestrator：`claim` → heartbeat → Visual → Voice → Subtitle → Compose → `jobs.complete`。Worker 只调 `run`。 |
| Visual | 本地 `MIN_PNG`，`IMAGE` + `VIDEO_SOURCE`。不调 `VideoProvider`。 |
| Voice | `MockTtsProvider.synthesize`，`AUDIO` + `VIDEO_AUDIO`。`clientRequestId = {jobId}:voice:{generationVersion}`。 |
| Subtitle | `MockSubtitleProvider`，合法 SRT，`SUBTITLE` + `VIDEO_SUBTITLE`。 |
| Compose | Step 6.4 起：`Storage.put` + Asset READY，**不**写 VIDEO_OUTPUT、**不**标 Video COMPLETED。`finalizeJob` 短事务提交 Link + Video + Job。 |
| Stage 幂等 | `reusableAssetIds`：checkpoint `assetIds` + `deletedAt=null` + `READY` + `Storage.exists`。Compose **不**按 `VIDEO_OUTPUT` Link 回查。 |
| Claim | 单条 `UPDATE ... WHERE PENDING OR (RUNNING AND heartbeat 过期)`，`attempt+1`。 |
| Heartbeat | 默认 15s；失败设 flag，阶段边界抛 `JOB_CONFLICT`。 |
| Lease | 默认 90s。`heartbeat < lease` 否则配置错误。 |
| `Job.output.stages` | JSON：`status: completed\|failed`、`assetIds`、`completedAt`、`duration?`。无 providerTask。 |
| `jobs.complete` / `fail` | 独立 `updateMany`，**不在** Compose 那个 transaction 里。 |
| fail 后的 Video | `updateMany` 条件含 `outputAssetId: null`。Video 已 COMPLETED 时**不会**被改回 FAILED。 |
| Orphan | **代码没有** `orphanKey`，Pipeline **没有** Storage 失败回滚删除。文档仍写 orphan 策略 → **以代码为准：未实现**。 |
| Provider 接口 | 全部同步一次返回。`Tts/Image/Subtitle/Compose` 有可选 `clientRequestId`。`VideoProvider.render` **没有** `clientRequestId` / capabilities；Pipeline **不再调用它**。 |
| Stage 注入 | 直接注入 `MockTtsProvider` 等具体类，不是接口 token。 |
| Queue | `enqueue(jobId)` only。无 delayed recheck。BullMQ `attempts: 3`。payload 只有 `{ jobId }`。 |
| Cancel | 无 HTTP cancel。无 `JobStatus` 扩展。 |
| 部分唯一 | `asset_links_one_video_output`：`(tenant_id, video_id) WHERE role=VIDEO_OUTPUT`。 |

### 1.2 文档冲突

| 文档说法 | 代码事实 | 本设计采用 |
| --- | --- | --- |
| design §1 仍写「一次 MockVideoProvider.render」 | 四阶段 Pipeline，不再调 `MockVideoProvider` | **Pipeline 为准** |
| job-queue-worker：Storage 失败写 `orphanKey` | 源码无此字段、无 delete | **未实现** |
| Provider 失败则 Video 不得 COMPLETED | Compose 已把 Video 标 COMPLETED 后，后续 `complete` 失败会把 Job FAILED，Video 仍 COMPLETED | **存在不一致** |

---

## 2. 当前 Pipeline 状态

```
POST /videos
  → CONFIRMED Script.payload
  → ProductionPlanBuilder
  → Video PENDING + Job PENDING（input.productionPlan 只读快照）
  → enqueue({ jobId })

Worker
  → 终态 skip / fresh RUNNING skip
  → 隔离校验
  → claim + heartbeat
  → Visual → Voice → Subtitle → Compose(Storage + Asset READY)
  → checkpoint compose
  → finalizeJob TX（VIDEO_OUTPUT + Video + Job COMPLETED）
```

能力已具备：Plan 快照、四阶段 Mock、Stage 幂等（仅 checkpoint）、lease / heartbeat、同 Job stale reclaim、用户 Retry = 新 Job。

**尚未具备（真实 Provider 前缺口）：**

- Finalize 单事务（Asset / Link / Video / Job 一起提交）
- Compose 从 `VIDEO_OUTPUT` 恢复（不仅 checkpoint）
- Provider Task 持久化
- 异步 submit / poll / delay
- 结果 URL 受控下载 / SSRF
- 计费幂等与「未知是否扣费」处理
- FFmpeg / 真实 TTS / 真实视频 API

---

## 3. Finalize consistency

### 3.1 当前提交顺序（代码）

```
1. MockComposeProvider.compose → Storage.put
2. prisma.$transaction:
     Asset.create READY
     AssetLink VIDEO_OUTPUT
     Video.update COMPLETED + outputAssetId + duration
3. jobs.mergeOutput（compose checkpoint, progress 95）
4. jobs.complete（Job COMPLETED, progress 100）
```

`2` 与 `3/4` 不是同一事务。`run()` 的 `catch` 对几乎所有错误执行 `jobs.fail`。

### 3.2 可能状态

| 状态 | 是否可达 | 路径 |
| --- | --- | --- |
| **A** Asset READY + Video COMPLETED + Job COMPLETED | 正常成功 | 1→4 全成功 |
| **B** Asset READY + Video COMPLETED + Job RUNNING | **是** | TX 提交后、`complete` 前崩溃；或 `complete` 抛 `JOB_CONFLICT` |
| **C** Asset READY + Video 非 COMPLETED + Job RUNNING | 难 | 当前 Compose 同 TX 写 Video；仅「Asset 在 TX 外创建」时出现。现码 Asset 在 TX 内，C 基本不可达 |
| **D** Job COMPLETED + Video 非 COMPLETED | 难 | 现码先 Video 后 Job。除非手工改库 |
| **E** VIDEO_OUTPUT 已有、`outputAssetId` 空 | 难 | 同 TX |
| **F** `outputAssetId` 已有、无 VIDEO_OUTPUT | 难 | 同 TX |
| **G（额外）** Video COMPLETED + Job **FAILED** | **是，且危险** | Compose TX 成功后任意异常 → `fail()`；Video 因 `outputAssetId != null` 不被改回 |
| **H（额外）** Storage 有文件、无 Asset | **是** | `put` 后、TX 前崩溃。无 orphan 清理 |

**结论：Finalize 当前确实有一致性风险。** Mock 下窗口短、文件小，测试不易打到。真实 Provider / FFmpeg 后窗口变大，G/B/H 会变成真实故障。

G 的业务后果：

- Processor 视 FAILED 为终态，**不能 reclaim**
- `POST /videos/:id/retry` 在 `COMPLETED && outputAssetId` 时抛 `VIDEO_CONFLICT`
- 用户看到成片，任务却是失败；也无法 Retry

B 在 lease 过期后**有机会** reclaim，但 Compose 只认 checkpoint。若 checkpoint 未写：会再 `asset.create` + 再插 `VIDEO_OUTPUT` → **部分唯一索引冲突** → 又掉进 G。

---

## 4. Finalize transaction（推荐）

Storage **禁止**进入长 DB 事务。

```
1. Provider / FFmpeg / Storage 全部结束（短文件已在 Storage）
2. 开启短 DB transaction
3. 按 tenantId 读取并校验 Asset：存在、READY、未软删
4. 确认或创建 VIDEO_OUTPUT（同一 video 至多一条；已存在则校验 assetId）
5. 更新 Video：outputAssetId、sourceJobId、duration、width、height、COMPLETED
6. 合并 Job.output（stages.compose + timeline + usage）
7. Job → COMPLETED、progress=100、lockedAt=null
8. commit
```

**最终推荐：`finalizeJob(tenantId, jobId, outputAssetId, facts)` 成为唯一成片提交点。**

Compose Stage 只负责：产出文件 + 创建 **未绑定成片指针的** VIDEO Asset（或复用已有 READY Asset）。**不要**在 Stage 内把 Video 标 COMPLETED。

Orchestrator：

```
composed = compose.run(...)   // Storage + Asset READY，可挂 jobId 的非 OUTPUT link 或暂不挂 OUTPUT
await finalizeJob(...)        // 短 TX：OUTPUT Link + Video + Job
```

`VIDEO_OUTPUT` 仍是关系真相；`outputAssetId` 仍是同事务写入的快指针。

失败处理：

- Finalize **未**提交：Job 保持 RUNNING（或捕获后 fail，且 Video 仍无 output → 可标 FAILED）
- Finalize **已**提交：禁止再 `fail()` 把 Job 打成 FAILED
- `catch` 必须先读库：若已是 A，视为成功 no-op

---

## 5. Finalize 幂等

`finalizeJob` 对同一 `jobId` 必须可重入。

| 已有事实 | 行为 |
| --- | --- |
| Job 已 COMPLETED，且 `output.stages.compose.assetIds[0] === outputAssetId`，Video.outputAssetId 相同，VIDEO_OUTPUT.assetId 相同 | **no-op**，返回成功 |
| Job 已 COMPLETED，但指向**另一个** Asset | **拒绝**（`JOB_CONFLICT`）。不覆盖 |
| Video.outputAssetId 已存在且等于本次 Asset，Job 仍 RUNNING | 补齐 Job COMPLETED + 校验 Link |
| VIDEO_OUTPUT 已存在且 assetId 相同 | 补齐 Video / Job |
| VIDEO_OUTPUT 已存在且 assetId **不同** | **拒绝**。不删旧成片、不插第二条 |
| Job FAILED / CANCELLED | **拒绝 Finalize** |
| Asset 非 READY / 已软删 / Storage 不存在 | **拒绝**，不标 Video COMPLETED |

查找顺序（重入）：

1. Job 终态 + 自身 output
2. `AssetLink(videoId, role=VIDEO_OUTPUT)`
3. `Video.outputAssetId`
4. `Job.output.stages.compose.assetIds`

三者不一致时以 **VIDEO_OUTPUT** 为准，指针与 Job.output 视为可修复缓存；Finalize 只修复**同一 Asset**，绝不换片。

---

## 6. Provider Task

真实 TTS / 视频 API 常见：`submit → providerTaskId → poll → result URL`。

比较：

| 方案 | 优点 | 缺点 | V1 |
| --- | --- | --- | --- |
| A. `Job.output.stages.{stage}.providerTask` | 无新表；跟 Stage 走；crash recovery 已读 output | JSON 查询弱 | **推荐** |
| B. `Job.output.providerTask` 单槽 | 实现快 | 四阶段并行/顺序会互相覆盖 | 否 |
| C. ProviderTask 表 | 可查询、可扫超时 | 个人项目过重；本阶段禁止建表 | V3 / SaaS |
| D. Job 新列 | 易索引 | 一列装不下多 Stage；要 migration | 否 |

**V1 推荐 A。不建 ProviderTask 表。不加 Job 列。**

建议 JSON（实现阶段再落地）：

```
providerTask: {
  providerId
  providerTaskId          // 厂商 id，日志只打 hash/尾 6 位
  status                  // 见 §7
  clientRequestId
  submittedAt
  lastPolledAt
  expiresAt?
}
```

禁止：`klingTaskId` / `runwayId` 等厂商字段进入通用合同。

---

## 7. Provider Task 状态

`JobStatus` **不变**：`PENDING` `RUNNING` `COMPLETED` `FAILED` `CANCELLED`。

厂商 `queued/processing/succeeded` **禁止**写入 `JobStatus`。

内部 JSON：`ProviderTaskStatus`

```
NOT_SUBMITTED
SUBMITTING          // 本地已写意图、尚未确认 taskId（防双花关键态）
SUBMITTED
WAITING
DOWNLOADING
SUCCEEDED
FAILED
EXPIRED
CANCELLED
UNKNOWN_BILLING     // 可能已扣费、本地无 taskId
```

这些不是 Prisma enum。

---

## 8. Provider interface evolution

现状：同步 `synthesize` / `render` / `generate` / `compose`。Mock 依赖「一次调用写完 Storage」。

**不要**为异步拆死成两套业务调用，以免 Mock 全改。

推荐（实现阶段最小扩展）：

```
MediaProvider
  id
  capabilities?: { async?, cancel?, timestamps?, idempotency? }

  // 现有同步方法保留给 Mock / 本地 FFmpeg
  // 新增可选：
  submit?(req & { clientRequestId, storageKey })
    → { mode: 'sync', result } | { mode: 'async', providerTaskId }

  getStatus?(providerTaskId)
    → { status, resultRef? }     // resultRef = 临时 URL 或内部 hint，不是 storageKey

  cancel?(providerTaskId)
```

Adapter：同步 Provider 的 `submit` 直接跑现有方法并返回 `mode: 'sync'`。  
Stage 只认 `submit` + `getStatus`；Mock 零行为变化。

**不推荐**现在做 `SynchronousMediaProvider` / `AsyncMediaProvider` 双继承树。  
**不推荐**改 Agent Engine 的 `ModelRouter`。媒体与 LLM 继续分开。

`VideoProvider.render` 已脱离 Pipeline。未来文生视频走 Visual Stage 的 Image/Video 接口，不要复活「一次 render 成片」。

---

## 9. Provider 幂等

当前：`clientRequestId = {jobId}:{stage}:{generationVersion}`；Scene 应再拼 `sceneId`。方向正确。

| 厂商能力 | V1 策略 |
| --- | --- |
| **A. 支持 idempotency key** | 每次 submit 带同一 key。重试安全。必须用。 |
| **B. 支持按 clientRequestId 查询** | 无 taskId 时先 lookup 再决定是否 submit。 |
| **C. 完全不支持幂等** | **高风险。** 禁止「响应丢失后自动再 submit」。 |

**C 的防护（必须同时做）：**

1. 调用前先把 Stage 写成 `SUBMITTING` + `clientRequestId`（短 DB 写，无 Storage）。
2. 再调用厂商。
3. 成功后立刻写 `SUBMITTED` + `providerTaskId`。
4. 崩溃在 2–3：重入见 `SUBMITTING` 且无 taskId → **停止自动重试**，标 `UNKNOWN_BILLING`，Job FAILED（可带「请人工确认是否已扣费」的 sanitized 错误）。**禁止**第二次 submit。
5. V1 选型优先 A 或 B。C 类厂商不得作为第一个收费能力，除非人工值守。

`clientRequestId` 稳定，禁止 UUID 每次重试都变。

---

## 10. Provider logging

允许：`provider` `model` `stage` `jobId` `requestId` `providerTaskId` 的 hash/尾部、duration、status、usage 数字。

禁止：API Key、Authorization、完整 Prompt、完整 Response、Signed URL 的 query token、旁白全文、用户邮箱。

与现有 Agent 日志一致：默认不记 Prompt。`AGENT_DEBUG_PROMPTS` **不要**复用到媒体。

---

## 11. Provider result download

```
Trusted Provider result URL
  → ProviderResultDownloader（仅 Worker）
  → 校验 host / 大小 / MIME
  → StorageService.put
  → Asset.storageKey（本系统地址）
```

Provider URL **永远不是**永久文件地址。Public DTO 继续不暴露 `storageKey`。

设计约束（实现阶段）：

- 下载 timeout 独立配置
- 最大字节：复用或略高于 `MEDIA_MAX_UPLOAD_BYTES`（现 32MB）；视频 Provider 需单独 `MEDIA_DOWNLOAD_MAX_BYTES`
- 校验 `Content-Type` / 魔数，不盲信 `Content-Length`
- 限制重定向次数与最终 host 仍在 allowlist
- 临时 URL 过期 → RETRYABLE，重新 `getStatus` 拿新 URL，不换 task
- 不把 URL 写入 Public Job.output（若必须留审计，只留过期时间和 host）

---

## 12. SSRF

下载器 **只接受本系统已注册 Provider 在本次 `getStatus` 返回的 URL**。  
**禁止**用户传入任意 URL 让服务器去拉。

`USER_ASSET` 只引用本租户已入库存的 Asset，不走 Provider 下载器。

V1 策略：

- Provider 注册 `resultHostAllowlist`（精确 host，禁止 `*.com`）
- 解析后禁止：localhost、127.0.0.0/8、10/8、172.16/12、192.168/16、169.254/16、::1、metadata host
- 先解析 DNS，再校验字面量 IP（缓解 DNS rebinding）；实现阶段再加
- 不跟随跳到非 allowlist host

---

## 13. Async polling

| 方案 | 评价 |
| --- | --- |
| A. Worker `while` sleep poll | 占死并发；lease 被迫拉到 20 分钟。**否** |
| B. BullMQ delayed recheck | 释放 worker；同一 `jobId` 再投递；与现有 `{ jobId }` 协议兼容。**V1 推荐** |
| C. Webhook | 预留接口，不作 V1 主路径（本机/NAT/签名/重放） |
| D. Scheduler 扫 DB | V2；无 queue 时的兜底 |

**V1：B。** `JobQueue` 未来最小扩展 `enqueueDelayed(jobId, delayMs)`。Webhook 只记「可加速 poll」，仍以 DB 中的 `providerTaskId` 为准。

现接口只有 `enqueue(jobId)`，无 delay → Step 6.4 若仍全同步，可先不改 Queue。

---

## 14. Lease 与异步 Provider

当前 lease 假设 Worker **持续占着** Pipeline（默认 90s）。等 10 分钟的 Provider 时：

- 不能靠连续 heartbeat 续租空等
- 不能把 Job 退回 `PENDING`（claim 会像新任务；若 Stage 未写 SUBMITTED 会重复 submit）

**推荐：**

```
SUBMIT → 写 providerTaskId
→ 停 heartbeat、lockedAt=null
→ Job 保持 RUNNING
→ enqueueDelayed
→ Worker 退出

到期后 process：
  RUNNING + lease 过期 + stage 已 SUBMITTED
  → claim（attempt+1）
  → 只 poll，禁止 submit
  → 未完成则再 delay 并再次释放
  → SUCCEEDED 则下载 / 建 Asset / 下一 Stage 或 Finalize
```

`PENDING` 仅表示从未开始。异步等待 **不是** PENDING。  
**不增加** `WAITING` JobStatus。等待态只在 `Job.output.stages.*.providerTask.status`。

Processor 现逻辑「RUNNING + 未过期 lease → skip」仍然正确。释放后无 heartbeat → lease 过期 → 可被下一 Worker claim。这要求 Stage 在 SUBMITTED 时**绝不能**再走「无 checkpoint 就 submit」。

---

## 15. Crash scenarios

### Case 1：submit 成功、taskId 未落库

见 §9。有幂等/lookup → 查回 task。无幂等 → `UNKNOWN_BILLING`，**禁止再 submit**。这是未来最大重复扣费点。

### Case 2：taskId 已保存，Worker 崩溃

新 Worker reclaim → 只 `getStatus(原 taskId)`。Stage 状态机：`SUBMITTED|WAITING` 禁止 submit。

### Case 3：下载与 Storage 成功，Asset 创建前崩溃

现码无 orphan 清理（与 job-queue 文档不符）。大文件不能「每次重入再下一遍」当唯一策略。

设计（不实现）：`storageKey` 在 submit/download 前按 assetId **预先生成**（现 Stage 已先 `randomUUID` + `buildStorageKey`）。重入：`Storage.exists(预定 key)` → 跳过下载，只补 Asset 行。不需要复杂 promote；预分配 key 即 temporary=final。超大对象 V2 再谈 multipart promote。

### Case 4：Asset READY，Finalize TX commit 前失败

重入：`finalizeJob` 按 §5 从 Asset / VIDEO_OUTPUT / Job.output / Video 恢复。不重新 Compose，不重新收费。

---

## 16. Stage 状态机

现 checkpoint 只有 `completed | failed`。真实 Provider 后 JSON 至少：

```
NOT_STARTED → SUBMITTING → SUBMITTED → WAITING
  → DOWNLOADING → READY/completed
  → FAILED | EXPIRED | UNKNOWN_BILLING
```

`READY/completed` 仍须通过现有 Asset 校验才算可跳过 Provider。  
这些不是 Prisma enum。

---

## 17. Version model

禁止混成一个 `version`。

| 名称 | 现码 | 含义 |
| --- | --- | --- |
| `productionPlan.version` | 字面量 `1` | **Plan JSON 合同**版本 |
| `generationVersion` | 内容指纹 | **这一次 Job 的输入指纹**（幂等/clientRequestId） |
| `scriptVersion` | Script.version | 文案对象版本 |
| `pipelineVersion` | **无** | 编排器实现版本（未来 `v1-mock` / `v1-ffmpeg`） |
| `provider.id` + `provider.model` | Job.provider 现为 `'mock-pipeline'` | 厂商与模型，**单独**字段 |

真实 Provider 的 model 名写入 `Job.output.stages.*.provider` / usage，**不要**写进 `productionPlan.version`。

---

## 18. 第一真实能力比较

| | 复杂度 | API 成本 | 稳定 | 调试 | 异步 | 可见效果 | 本机要求 | 架构价值 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A** 真 TTS + Mock 视觉/Compose | 中 | 中（按字） | 高 | 易 | 常同步 | 听得见，播不出真视频 | 低 | 验证计费/幂等 |
| **B** 真 TTS + 色板 + SRT + 真 FFmpeg | 高 | 中 | 中 | 中（编解码） | TTS 或同步 | **可播放 MP4** | 需 FFmpeg 二进制 | 高，接近产品 |
| **C** 真 Image + Mock TTS/Compose | 中 | 中（按张） | 中 | 中 | 常同步 | 静帧，不成片 | 低 | Visual 路由 |
| **D** 真 TTV | 很高 | 很高 | 低 | 难 | **强异步** | 炫但贵 | 低（云端） | 过早 |
| **E** 真 I2V | 很高 | 高 | 低 | 难 | 强异步 | 依赖先有图 | 低 | 在 D 之后 |

---

## 19. 推荐的第一个真实可播放闭环

**产品目标（不是 Step 6.4）：**

```
COLOR_BACKGROUND + 真实或占位配音 + SRT + 本地 FFmpeg → 可播放 MP4
```

**是否推荐「真 TTS + SRT + FFmpeg 色板」作为首个真实 MP4？**

- **作为产品闭环：推荐。** 成本可控、异步最弱、不依赖 GPU、用户立刻能播、逼出 Finalize / duration / 字幕时间轴。
- **作为 Step 6.4 一次做完：不推荐。** 同时引入收费 TTS + 本机 FFmpeg 分发 + Finalize 改造，范围过大，且 Finalize 未修时一崩溃就会出现「Video COMPLETED + Job FAILED」和重复扣费。

拆步：

1. **先修 Finalize**（无厂商、无 FFmpeg）
2. **再 FFmpeg Compose**（仍 Mock TTS）→ 第一个可播放 MP4，**零扣费风险**
3. **再换真实 TTS**（同步或短异步 + 幂等）

TTV/I2V 放到 Finalize + 异步 poll + 下载器都落地之后。

---

## 20. FFmpeg 架构

```
CompositionStage
  → ComposeProvider
    → FfmpegComposeProvider     // Worker 进程内
    → MockComposeProvider       // 测试
```

- **只能**在 Worker / Provider 层 `spawn`
- Controller / VideosService **禁止**调 ffmpeg
- CPU x264 + 色板 + 音轨 + 硬字幕即可，不要求 GPU
- Windows / macOS / Linux：通过 `FFMPEG_PATH` 或探测 `ffmpeg`；缺二进制 → 明确 `COMPOSE_UNAVAILABLE`，不要假装 Mock 成功
- 输入输出都走 Storage（先 `get` 到工作目录或 stdin 策略在实现阶段定）；禁止 Stage 手写 `fs.writeFile` 业务文件

本 Step **不安装、不下载** ffmpeg。

---

## 21. FFmpeg 分发

| | 开发阶段 | 未来 Tauri / 商业 |
| --- | --- | --- |
| A. 用户自装 | **开发推荐**：文档说明 PATH | 体验差 |
| B. 应用附带 | 不在开发 Step 做 | 桌面版主路径（注意 GPL/许可证） |
| C. Server Worker 使用 | 与 A 相同（开发机/CI） | 若变 SaaS Worker |
| D. Cloud Compose | 否 | 无本机二进制时的后备 |

开发：C/A。不要把 binary 提交进 git。

---

## 22. TTS Provider 选型清单（不选厂商）

Step 6.4 **之后**选型须收集：

中文自然度、多语言、voice/style、speed、是否返回 **duration**、是否词级/句级 **timestamps**（无则继续用 durationBudget 缩放 SRT）、同步 vs 异步、**idempotency / 按 clientRequestId 查询**、结果是否允许下载到自有 Storage、商业许可、单价（字/分钟）、QPS、日限额、失败率、超时、区域与隐私。

**第一个收费 TTS 必须是 A 或 B 类幂等。C 类不进主路径。**

---

## 23. 视频 Provider 选型清单（不选厂商）

TTV / I2V 支持、最长 duration、分辨率、9:16、**每秒成本**、纯异步 API、webhook、idempotency、poll、**result URL 寿命**、商用版权、并发与日额、失败率、内容审核错误是否可区分。

本 Step 不选厂商。TTV 不作为第一个真实能力。

---

## 24. Credential architecture

三种模式（实现时经 **Provider configuration boundary**，Stage **禁止** `process.env.VENDOR_KEY`）：

| 模式 | 谁的 Key | 读取 |
| --- | --- | --- |
| 开发环境变量 | 开发者 `.env` | `MediaProviderConfig` 启动时注入 |
| 用户自带 Key | 未来设置页密文 | 按 tenant 解密后注入 **该次** Provider |
| SaaS 平台 Key | 平台账户 | 服务端配置，不进 Frontend |

不要本 Step 做 Secret Manager。可对标现有 `MODEL_*` 的「配置齐全才启用 Real」，但媒体模块独立，不复用 `RealModelProvider`。

---

## 25. Provider registry

V1：**Nest DI token**。例如 `TTS_PROVIDER` → 一个实现。配置切 Mock / Real。

不需要 `MediaProviderRegistry` marketplace、质量分、自动多厂商 fallback。

V2：按 `capabilities` 选默认 TTS vs Compose。仍单实现为主。

---

## 26. Usage / cost

现 `Job.output.usage`：`imageCount` `audioCharacters` `audioSeconds` `videoSeconds` `estimatedCost`（Mock 为 0）。

V1 够用。扩展字段（仍 JSON，不建表）：`currency` `provider` `model`。

**SaaS 前不建 Usage 表、不做账本、不扣用户余额。**  
`estimatedCost` 只是审计估计，不是发票。

---

## 27. Timeout

禁止单一 `MEDIA_TIMEOUT`。

| 配置（名待实现） | 管什么 |
| --- | --- |
| `JOB_LEASE_TIMEOUT_MS` | 已有：执行占位 |
| `JOB_HEARTBEAT_INTERVAL_MS` | 已有 |
| `PROVIDER_HTTP_TIMEOUT_MS` | submit/getStatus HTTP |
| `PROVIDER_TASK_TIMEOUT_MS` | 异步任务墙钟（超时 → EXPIRED） |
| `PROVIDER_DOWNLOAD_TIMEOUT_MS` | 拉结果 |
| `FFMPEG_TIMEOUT_MS` | 本地合成 |
| `WORKER_JOB_TIMEOUT_MS` | 单次 process 墙上时间（不含 delay 等待） |

异步等待靠 delayed job，不占用 `WORKER_JOB_TIMEOUT`。

---

## 28. Rate limit

BullMQ concurrency ≠ 厂商并发。

设计：每个 `providerId` 一个**进程内**信号量（V1）。账号 QPS / 日额由配置数字硬限制，超限 = `RETRYABLE_PROVIDER_ERROR` + delayed requeue。

**不要**本 Step 做 Redis semaphore。SaaS 多 Worker 再上分布式。

---

## 29. Retry classification

先设计，**不扩大** `AppError` enum。

| 类 | 含义 | 同 Job 技术重试 | Job FAILED | 要用户改输入 |
| --- | --- | --- | --- | --- |
| `RETRYABLE_INFRA_ERROR` | DB/Redis/磁盘短暂 | 是（BullMQ / delay） | 耗尽后 | 否 |
| `RETRYABLE_PROVIDER_ERROR` | 5xx、限流 | 是，有上限 | 耗尽后 | 否 |
| `NON_RETRYABLE_PROVIDER_ERROR` | 4xx 业务、明确失败 | 否 | **立即** | 视情况 |
| `INVALID_INPUT` | Plan/脚本不合法 | 否 | 立即 | **是** |
| `CONTENT_POLICY` | 审核拒绝 | 否 | 立即 | **是** |
| `CANCELLED` | 用户取消 | 否 | 否（CANCELLED） | 否 |
| `TIMEOUT` | 任务墙钟 | 视厂商：可 poll 则 delay；确认死则 FAILED | 确认后 | 否 |
| `UNKNOWN_BILLING` | 可能已扣费 | **否** | 立即 | 人工 |

同 Job 技术重试 ≠ 用户 Retry（新 Job、新 Plan、不复用 Asset）。

---

## 30. Content policy

`Job.error`：`{ code: 'CONTENT_POLICY', message: 短中性句 }`。  
不回传厂商安全分类原文、模型内部分数、完整 Prompt。  
**禁止**自动改写 Prompt 绕过审核。

---

## 31. USER_ASSET 隔离

Pipeline 引用用户素材必须：

`findFirst({ id, tenantId, workspaceId, projectId, deletedAt: null, status: READY })`

禁止只拿 `assetId`。跨项目 = 当不存在。沿用 `AssetsService.requireAsset` 的三维隔离。本 Step 不实现 USER_ASSET 执行。

---

## 32. Cancellation

设计、不实现：

1. API 将 Job 标 `CANCELLED`（仅 PENDING / RUNNING）
2. 停后续 delayed enqueue（BullMQ remove 同 jobId）
3. 若有 `providerTaskId` 且 `capabilities.cancel` → best-effort `cancel`
4. 已生成中间 Asset **保留**
5. **禁止 Finalize**；已 A 状态的不撤销成片（V1 不支持「取消已完成」）

---

## 33. V1 / V2 / V3

| | 做 | 不做 |
| --- | --- | --- |
| **V1 Finalize（Step 6.4 已实现）** | Finalize 单事务 + 幂等；Compose 只产 Asset；catch 不再制造 G | 真 TTS、FFmpeg 安装、S3、新表 |
| **V1.1 FFmpeg（Step 6.5 已实现）** | `FfmpegComposeProvider` + 本机 ffmpeg；Mock WAV / SRT / 色板 → 可播放 MP4 | 收费 API |
| **V1.2** | 一个同步/短异步、支持幂等的 TTS；usage 数字 | TTV、Webhook 主路径 |
| **V2** | `enqueueDelayed` + providerTask JSON + 下载器 + SSRF allowlist | Provider 市场 |
| **V3 / SaaS** | ProviderTask 表、Usage 表、分布式限流、用户自带 Key、Cloud Compose | — |

---

## 34. 风险分级

### P0 — 真实 Provider **之前**必须解决

- **Finalize 一致性**（状态 B/G；catch 误 fail）
- **Finalize 幂等** + 从 VIDEO_OUTPUT 恢复（避免唯一索引撞车）
- Compose 成功后禁止再把 Job 打 FAILED

### P1 — 第一个真实闭环需要

- 预分配 storageKey / exists 跳过重复下载
- Provider 调用前 `SUBMITTING` 落库
- 幂等 key / 禁 C 类自动重提交
- FFmpeg 仅 Worker；缺二进制明确失败
- 分类错误（至少 FAILED vs 可重试）

### P2 — SaaS 前

- 异步 delay poll + lease 释放
- SSRF / 临时 URL 下载
- 账号级 rate limit
- cancel
- usage 账本 / 用户 Key
- 对象存储迁移

### P3 — 优化

- Webhook
- Provider marketplace
- GPU / 云合成
- multipart promote
- 精确成本路由

---

## 35. 推荐的 Step 6.4

**只做：Finalize Consistency（本地、无厂商、无 FFmpeg、无新依赖）。**

建议范围：

1. `finalizeJob` 短事务：VIDEO_OUTPUT + Video + Job.output + Job COMPLETED
2. Compose **不再**单独把 Video 标 COMPLETED
3. 重入：已完成 Finalize → no-op；TX 失败 → 从 Asset / Link 恢复
4. `run()` catch：若已 Finalize 成功则视为成功，**禁止** Job FAILED + Video COMPLETED
5. 测试覆盖状态 A/B/G 的恢复与幂等
6. 更新实现文档

**明确不做：** 真实 TTS / 图 / 视频、FFmpeg 安装、S3、ProviderTask 表、Queue delay、Webhook、Agent、API 形状、Frontend。

---

## 36. 最终架构

```
Script.payload
  → ProductionPlanBuilder → Job.input.productionPlan（只读）
  → Worker claim / lease
  → Visual / Voice / Subtitle / Compose   (Provider.submit | sync Mock)
        ↘ 异步：providerTask @ Job.output.stages.*
        ↘ delay requeue（V2）
  → StorageService（本系统文件）
  → finalizeJob TX
        Asset READY
        AssetLink VIDEO_OUTPUT
        Video COMPLETED + outputAssetId + duration
        Job COMPLETED
```

```
AgentRun ≠ Job
JobStatus ≠ ProviderTaskStatus
Provider URL ≠ storageKey
BullMQ attempts ≠ jobs.attempt
用户 Retry ≠ crash recovery
```

---

## 37. Step 6.4 之后不要自动做什么

本设计评审通过前，不要安装 FFmpeg、不要接收费 TTS、不要进 movie.editing、不要建 ProviderTask 表。
