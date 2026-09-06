# Job Queue / Worker

状态：**已实现（Redis + BullMQ + Pipeline + Lease）。**  
生产链：[video-generation-pipeline-implementation.md](./video-generation-pipeline-implementation.md)

PostgreSQL `Job` 是唯一业务事实来源。Redis / BullMQ 只负责投递，不是第二套状态库。

---

## 职责

| 组件 | 职责 |
| --- | --- |
| Backend | HTTP、Auth、Authorization、构建 ProductionPlan、创建 Video/Job、`JobQueue.enqueue(jobId)` |
| Worker | 消费队列、按 `jobId` 重读数据库、隔离校验、**按 `Job.kind` 分发**。`VIDEO_GENERATION`、`VIDEO_PUBLISH`、`PUBLICATION_METRICS_SYNC`（MOCK provider）均有 handler；其它 kind fail closed |
| Redis / BullMQ | Queue。payload 只有 `{ jobId }` |
| PostgreSQL | Job / Video / Asset / AssetLink / Publication 状态；lease / heartbeat / attempt |
| Mock Stages | Visual / TTS / Subtitle / Compose，经 StorageService 写真实对象 |
| AgentRun | 仍是 AI 审计，与 Job / Publication 无关 |

---

## 调用链

```
POST /videos
  → ProductionPlanBuilder（读 Script.payload）
  → Video + Job（input.productionPlan 快照）
  → JobQueue.enqueue(job.id)
  → 立即返回 PENDING

Worker
  → BullMQ { jobId }
  → prisma.job.findUnique({ id })
  → 终态 / 未过期 RUNNING → skip
  → 隔离校验
  → 按 Job.kind 分发
     VIDEO_GENERATION → VideoGenerationService.run
     VIDEO_PUBLISH → PublishExecutionService.run（Mock；未实现平台 fail closed）
     PUBLICATION_METRICS_SYNC → MetricsSyncExecutionService.run（MockMetricsProvider；真实平台 fail closed）
     其它 kind → JOB_KIND_UNSUPPORTED
  → 禁止 fallback 到视频生成或发布
```

---

## 配置

只使用 `REDIS_URL`（例如 `redis://127.0.0.1:6379`）。密码只能来自环境变量。不要提交真实密码。日志不打印 Redis URL。

Queue 名：`acf-jobs`。BullMQ `jobId` = 数据库 Job.id。

Lease：`JOB_LEASE_TIMEOUT_MS`（默认 90s）、`JOB_HEARTBEAT_INTERVAL_MS`（默认 15s）。heartbeat 必须小于 lease。数据库 `attempt` 与 BullMQ `attemptsMade` 不是同一事实。

`NODE_ENV=test` 且未设 `RUN_REDIS_TESTS=true` 时使用内存队列，不连接 Redis。

---

## 状态

数据库 Job：`PENDING` → `RUNNING` → `COMPLETED` | `FAILED`。无 `RETRYING`。  
（Prisma 枚举是 `RUNNING`，不是 `PROCESSING`。）

BullMQ 的 waiting/active/completed/failed 只是队列态。

用户 Retry：`POST /videos/:id/retry` 创建**新** Job（新 Plan），再 enqueue。不复用旧 Job 中间 Asset。

同 Job crash recovery：仅 **stale RUNNING** 可 reclaim，Stage 幂等跳过已完成阶段。FAILED / COMPLETED / CANCELLED 不自动 reclaim。

---

## 失败

- enqueue 失败：Job / Video → `FAILED`，HTTP `503 JOB_ENQUEUE_FAILED`
- 租户隔离失败：不调用 Provider，`JOB_ISOLATION_VIOLATION`
- Provider 失败（含 `__mock_fail__` / `__mock_fail_finalize__`）：Job FAILED，Video 不得 COMPLETED
- Finalize 与 Compose 已拆开：`Compose READY ≠ Video COMPLETED`
- Storage 成功而 Asset 行失败：现码无 `orphanKey`（仍未实现）

---

## 进程

```bash
npm run db:up          # PostgreSQL + Redis
npm run dev:backend
npm run dev:worker
```

Worker 处理 SIGTERM / SIGINT：停收新任务、等当前 Job、关 Worker / Redis / Prisma。不 `process.exit()`。
