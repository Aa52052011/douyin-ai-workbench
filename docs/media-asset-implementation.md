# Media Asset / Job / Video 实现说明

状态：**V1 已实现（Mock Pipeline + LocalStorage + Lease）。**  
设计：[video-asset-implementation-design.md](./video-asset-implementation-design.md)  
架构：[media-asset-architecture.md](./media-asset-architecture.md)  
生产链：[video-generation-pipeline-implementation.md](./video-generation-pipeline-implementation.md)

已接 Redis / BullMQ / Worker / 四阶段 Mock Pipeline。未接 FFmpeg / 真实视频/TTS API / S3。详见 [job-queue-worker.md](./job-queue-worker.md)。

---

## 1. Asset

统一文件元数据。二进制在 `StorageService`，不进 Postgres。  
状态：`PENDING → READY | FAILED`。软删 `deletedAt`。  
两阶段上传：`POST /assets` → `PUT /assets/:id/content` → `POST /assets/:id/complete`。

## 2. AssetLink

角色含 `VIDEO_OUTPUT` 等及影视预留 `MOVIE_*`。`videoId` / `jobId` 至少其一。  
`VIDEO_OUTPUT` 每个 Video 至多一条（部分唯一索引）。

## 3. Job

`kind` 含 `VIDEO_GENERATION` 等。状态无 `RETRYING`。retry 创建新行。  
`agentRunId` 可选，无 FK。AgentRun 不加 `jobId`。  
`lockedAt` / `lastHeartbeatAt` / `attempt`：Worker lease。旧行 `attempt=0`、时间戳为空。  
`Job.input.productionPlan` 是提交时只读快照。`Job.output.stages` 记录阶段 Asset。

## 4. Video

成片业务对象。保留 `filePath` 但不写入。新增 `outputAssetId`、`sourceJobId`（无 FK）。  
应用层不写 `PROCESSING`。执行态看 Job。

## 5. Storage

`StorageService` → `LocalStorageProvider`。  
Key：`v1/{tenantId}/{workspaceId}/{projectId}/{assetId}/{objectId}`。  
配置：`MEDIA_STORAGE_ROOT`（默认 `./storage`）。  
`getUrl` 返回 `local://{key}`，不是磁盘路径。下载走 `GET /assets/:id/content`。

## 6. Provider

Pipeline 使用 `MockTtsProvider` / `MockSubtitleProvider` / `MockComposeProvider`（及 Visual 色板）。均经 Storage 写真实对象。`MockVideoProvider` 仍保留单测，生产链不再调用。接口支持 `clientRequestId`，不含厂商字段。

## 7. API

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| POST | `/assets` | `project:update` |
| PUT | `/assets/:id/content` | `project:update` |
| POST | `/assets/:id/complete` | `project:update` |
| GET | `/assets?projectId=` | 登录 |
| GET | `/assets/:id` | 登录 |
| GET | `/assets/:id/content` | 登录 |
| DELETE | `/assets/:id` | `project:update` |
| POST | `/videos` | `agent:execute` |
| GET | `/videos?projectId=` | 登录 |
| GET | `/videos/:id` | 登录 |
| POST | `/videos/:id/retry` | `agent:execute` |

`POST /videos` 只收 `scriptId` + 可选生成配置。`projectId` 来自 Script。DRAFT Script → `409 VIDEO_SCRIPT_NOT_CONFIRMED`。创建时构建 ProductionPlan 并入队，立即返回 `PENDING`。无 Stage HTTP。

## 8. Security

32MB 上限；MIME allowlist；原始文件名仅展示；storageKey 系统生成；路径穿越拒绝；跨租户 404；响应不含 `MEDIA_STORAGE_ROOT`。

## 9. Retry

仅 FAILED 或无 OUTPUT 的 Video。新 Job，不复用旧 id。COMPLETED 再生成请 `POST /videos`。

## 10. Idempotency

`x-idempotency-key` 或合法 `x-request-id`：同一 tenant+workspace+scriptId+key 返回同一 Video。无 Redis。

## 11. Tenant isolation

`findFirst({ id, tenantId, workspaceId, deletedAt: null })`。列表强制 `projectId`。AssetLink 复合 FK 含 tenantId。

## 12. Migration

`20260831040000_add_media_asset_job_video`。  
`20260831050000_add_job_worker_lease`。不改历史 migration。旧 `filePath` 保留。

## 13. Tests

Storage / Mock Provider unit；Asset e2e；Video e2e；schema 含 assets/jobs/links。

## 14. Redis / Worker

已实现。Backend 只 `enqueue(jobId)`。`workers/` 进程调用同一 `VideoGenerationService`。测试默认内存队列。

## 15. Future movie.editing

同一 Asset / AssetLink / Job。`kind=MOVIE_EDITING`，role=`MOVIE_*`。不建 MovieFile 表。
