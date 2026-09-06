# Publishing Foundation（Step 8.2）

状态：**schema / SecretStore / Job 分发已落地。真实 Douyin 发布未实现。**

依据：[architecture.md](./architecture.md)、[database-architecture.md](./database-architecture.md)、[job-queue-worker.md](./job-queue-worker.md)。

---

## 对象边界

| 对象 | 是什么 | 不是什么 |
| --- | --- | --- |
| Video | 系统内部成片。状态仍是 PENDING / PROCESSING / COMPLETED / FAILED | 不是「已发布」。禁止 `Video.status = PUBLISHED` |
| Publication | 一次向外部平台发布的业务记录 | 不是 Job，不是 Video |
| Job | 耗时执行。`JobKind.VIDEO_PUBLISH` 承载发布任务 | 不是业务真相。BullMQ 只投递 `{ jobId }` |
| AgentRun | AI 执行审计 | 发布不是 Agent。不要做 `douyin.publish:v1` |

同一 Video 可以有多条 Publication（多平台、多账号、历史再发）。`idempotencyKey` 在租户内唯一。不要对 `(videoId, platformAccountId)` 做 unique。

---

## SecretStore

`PlatformAccount.credentialRef` 只保存 Secret id。

- 实现：`EncryptedDbSecretStore`（AES-256-GCM）
- 主密钥：环境变量 `PLATFORM_SECRET_MASTER_KEY`，**32 字节的 base64**。缺省、截断、填充一律 fail closed。
- 主密钥不入库、不进 API、不打日志。
- `PlatformSecret` 存 `cipher` / `nonce` / `authTag` / `keyVersion`。无明文 token 列。
- `get` 必须带 tenant + workspace。跨租户返回 `SECRET_NOT_FOUND`。`revokedAt` 后不得当活跃凭据读取。

V1 只实现加密存储与隔离。Douyin OAuth 见 [douyin-oauth.md](./douyin-oauth.md)。OAuth 已连接 **不等于** Douyin 发布已开通。

---

## Publication 状态（enum only）

`PENDING` `UPLOADING` `SUBMITTING` `PROCESSING` `PUBLISHED` `FAILED` `UNKNOWN_EXTERNAL_STATE` `CANCELLED`

没有 `DRAFT`。V1 创建后进入 `PENDING`。

`UNKNOWN_EXTERNAL_STATE` 不能折叠进 `FAILED`。含义：外部 create 请求可能已经成功，但我方没收到响应。此状态 **禁止盲重发**。完整状态机与 PublishService 属于后续步骤。

`mode`：`API` | `MANUAL`。MANUAL 允许 `platformAccountId` 为空。定时发布字段 `scheduledAt` 已预留，V1 不实现。

`providerResponseMetadata` 只允许非秘密字段（request / upload / item / video id、error code、status）。禁止 token。

---

## Job 分发

Worker 按 `Job.kind` 分发：

- `VIDEO_GENERATION` → 现有 `VideoGenerationService`
- `VIDEO_PUBLISH` → `PublishExecutionService`（Mock provider，零外部调用）
- `PUBLICATION_METRICS_SYNC` → 明确 `METRICS_SYNC_HANDLER_NOT_IMPLEMENTED`（地基在 9.2；执行在 9.4）
- 其它已有 kind（`MOVIE_EDITING` `TTS_GENERATION` `SUBTITLE_GENERATION` `VIDEO_COMPOSE`）当前 **不是** 顶层 Worker Job，一律 `JOB_KIND_UNSUPPORTED`
- 未知 kind 禁止 fallback 到视频生成

`GET /videos/:id` 的 `job` 只代表生成 Job：优先 `Video.sourceJobId`（且 `kind = VIDEO_GENERATION`），否则最新一条 `VIDEO_GENERATION`。不再取「该 Video 上任意最新 Job」。

---

## 权限

| 权限 | OWNER | ADMIN | EDITOR | MEMBER / VIEWER |
| --- | --- | --- | --- | --- |
| `platform_account:manage` | ✓ | ✓ | ✗ | ✗ |
| `publication:create` | ✓ | ✓ | ✓ | ✗ |

禁止复用 `agent:execute`。

---

## Publication API + Job pipeline（Step 8.4）

内部闭环：Completed Video → `POST /videos/:videoId/publications` → `VIDEO_PUBLISH` Job → Queue `{ jobId }` → Worker → `MockPublishingProvider` → Publication / Job 终态。

- 只允许 `mode=API` + `platform=MOCK`。其它平台的 **API** create 前 `PUBLISHING_PROVIDER_NOT_IMPLEMENTED`，禁止 fallback MOCK。`mode=MANUAL` 见 Step 8.5。
- `x-idempotency-key` 必填。同 tenant + 同 key + 同 fingerprint 返回已有 Publication，不重复 Job/enqueue。语义不同 → `IDEMPOTENCY_KEY_CONFLICT`。
- Job.input 只有 `{ publicationId }`。业务字段从 DB 重载。
- 调用 `publishVideo()` 前将 Publication 标为 `SUBMITTING`（比真实两阶段更保守；未来 Douyin 需拆开 upload/submit checkpoint）。
- Provider 映射：`ACCEPTED+PUBLISHED` → Publication `PUBLISHED` + Job `COMPLETED`；`ACCEPTED+PROCESSING` → 先 `PROCESSING`，Worker 内立即 `getPublishStatus` 调和为 `PUBLISHED`（无 timer/scheduler）；`REJECTED` → Publication `FAILED` + Job `FAILED`；`UNKNOWN` → Publication `UNKNOWN_EXTERNAL_STATE` + Job `COMPLETED`。UNKNOWN **禁止自动 retry / 盲重放**。
- `retryClass` 存在 `providerResponseMetadata.retryClass`（无 migration）。HTTP retry 仅 `FAILED` + `SAFE_TO_RETRY|TEMPORARY`。UNKNOWN / PERMANENT / 非 FAILED 拒绝。Retry 同 Publication、新 Job、覆盖 `sourceJobId`。
- 仅 `sourceJobId == 当前 Job.id` 的执行会调 Provider。旧 Job → `CANCELLED`。
- 正式 POST body **没有** `scenario`。测试通过 `MockPublishingProvider.configureScenario(publicationId)`。

**未**实现 Douyin OAuth/API、status scheduler（8.8）、UI。Publication 指标见 [publication-metrics.md](./publication-metrics.md)。

---

## Manual Export + Manual Publication（Step 8.5）

V1 现在同时拥有：

- **API Mock publishing**（8.4）：系统经 Job/Worker 调 `MockPublishingProvider`
- **Manual publishing**：用户导出成片、在平台手工上传，再回系统登记结果

`mode=MANUAL` 可以是 `DOUYIN` / `TIKTOK` / `YOUTUBE` / `XIAOHONGSHU` / `BILIBILI` / `CHANNELS` / `MOCK`。**不**解析 PublishingProvider Registry，**不**创建 `VIDEO_PUBLISH` Job，**不** enqueue，**不**要求 PlatformAccount。

创建后状态为 `PENDING`（已准备发布，尚未由用户确认外部完成）。`POST /publications/:id/manual-complete` 在用户提供 `externalPostId` 或 `externalUrl`（至少其一）后变为 `PUBLISHED`，`publishedAt` 由服务端写入。这表示**用户确认**已在外部平台发布，系统**不会** fetch URL 或验证帖子真实存在。

`GET /videos/:videoId/export` 按 Video → output Asset → `Storage.get` 下载成片。`Content-Disposition: attachment`。不暴露 `storageKey` 或本机绝对路径。未来 Desktop/Tauri 可以升级为 Save As / Open Folder，当前不实现 Tauri filesystem API。

同一 Video 可以同时有 Douyin MANUAL Publication 与 MOCK API Publication。`Video.status` 仍是 `COMPLETED`。

---

## Provider contract（Step 8.3）

`PlatformPublisher` 是外部平台交互边界。**不写** Publication / Video / Job。

方法：`validateAccount` `publishVideo` `getPublishStatus`。

`publishVideo` 结果不是 `success: boolean`，而是：

- `ACCEPTED`：平台已明确受理
- `REJECTED`：平台明确拒绝，带 `retryClass`
- `UNKNOWN`：请求可能已发出但无法确认，对应未来 `Publication.UNKNOWN_EXTERNAL_STATE`。禁止据此盲重发 create。

Retry class：`SAFE_TO_RETRY` `TEMPORARY` `PERMANENT` `UNKNOWN_EXTERNAL_STATE`。

Registry：`Platform.MOCK` → `MockPublishingProvider`。其它平台 **fail closed** `PUBLISHING_PROVIDER_NOT_IMPLEMENTED`，禁止 fallback 到 MOCK。

Mock 场景：`SUCCESS` `PROCESSING` `VALIDATION_FAILURE` `UPLOAD_FAILURE` `UNKNOWN_AFTER_SUBMIT`。默认 SUCCESS。生产 API **没有** `scenario` 字段。测试用 `MockPublishingProvider.configureScenario(publicationId)`（或 Provider 单测的 `input.scenario`）。

已有 `providerUploadId` 时 Mock 跳过 upload。文件只按 `storageKey` 做 `exists` 检查，不把 MP4 放进 Job，也不把 `local://` 当公网 URL。

**未**实现 Douyin / TikTok / YouTube 发布。

---

## 明确未做

**未**实现 Douyin Provider、status polling scheduler（8.8）、UI、scheduled / auto publish、Tauri filesystem export。OAuth 账号连接见 [douyin-oauth.md](./douyin-oauth.md)。Publication 级指标地基见 [publication-metrics.md](./publication-metrics.md)。
