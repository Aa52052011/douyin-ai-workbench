# 数据库架构（V1.0 基础层）

状态：Prisma schema 与 migration 已落地，**无认证/业务逻辑**。  
依据：[auth-architecture.md](./auth-architecture.md)、[PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)。  
唯一模型来源：`database/prisma/schema.prisma`。不要在 NestJS / FastAPI 中再定义一份表结构。

---

## 1. 数据库总体架构

```
apps/frontend          禁止直连数据库
        │
apps/backend           未来通过 database 包使用 Prisma Client
        │
database/              本阶段唯一数据库工程
  prisma/schema.prisma
  prisma/migrations/
        │
PostgreSQL 16          Docker Compose 服务名 postgres
```

- 引擎：PostgreSQL 16
- ORM：Prisma（schema 即结构真相）
- 连接：`DATABASE_URL`（见 `.env.example`，真实密码不入库）
- 官方本地启动（Docker 可用）：`docker compose up -d postgres`（PostgreSQL 16，端口 5432）
- Windows 无 Docker：`npm run db:local:start`（PostgreSQL 16.14 持久 cluster，`127.0.0.1:55432/acf_dev`）。数据目录 `.local/postgres/data`，不入库。
- 本机若无 Docker：`npm run db:test` 会启动**临时**嵌入式 PostgreSQL 16 跑约束测试。这不是换引擎，只是测试夹具，不要当作 `acf_dev`。
- 本阶段不启用 RLS、不接 Redis。认证逻辑在 `apps/backend`，本目录仍只负责 schema 与客户端。

---

## 2. Entity 关系

```
User (无 tenant_id)
  │
  ├── Membership (user_id + tenant_id UNIQUE, role)
  │         │
  │         ▼
  └──     Tenant
            │
            ▼
        Workspace (tenant_id, slug 租户内唯一)
            │
            ▼
         Project (tenant_id + workspace_id，复合外键)
            │
     ┌──────┼──────────┐────────┐────────┐
     ▼      ▼          ▼        ▼        ▼
ContentPlan Script    Video   AgentRun  Asset
     │      │          │                  │
     └──────┘          │                  │
   (可选关联)          ├── Job            │
                       └── AssetLink ─────┘
                       Analytics (DEPRECATED Video 级；禁止新写入)
                       Publication (1 Video : N 外部作品)
                         └── PublicationMetricSnapshot (新 SoT)

User 1:N RefreshToken   （只存 token_hash，级联删除）
Agent Definition 不入库（代码注册）。AgentRun 入库。
```

核心业务行同时带 `tenant_id` 与 `workspace_id`。  
`Project` / `ContentPlan` / `Video` / `Analytics` 使用 `(id, tenant_id)` 复合外键，**禁止** Workspace 属于租户 A 而子资源写成租户 B。

---

## 3. 每个模型职责

| 模型 | 职责 | 软删 |
| --- | --- | --- |
| User | 全局登录身份 | `deletedAt` |
| Tenant | 隔离根、未来计费根 | `deletedAt` |
| Membership | 用户加入租户及角色 | 硬删（解除关系） |
| Workspace | 协作空间 | `deletedAt` |
| Project | 账号/选题项目 | `deletedAt` |
| ContentPlan | 内容规划（JSONB payload + 定位快照 + 版本） | `deletedAt` |
| Script | 脚本（JSONB payload + Topic 快照 + 版本） | `deletedAt` |
| Asset | 统一文件元数据（对象在 StorageProvider） | `deletedAt` |
| AssetLink | Video/Job 与 Asset 的角色关系 | 硬删链接 |
| Job | 耗时媒体任务（与 AgentRun 分离） | 无软删 |
| Video | 成片业务对象（outputAssetId，不存二进制）。与 Job COMPLETED、VIDEO_OUTPUT 在 Finalize 同事务提交 | `deletedAt` |
| PlatformAccount | Workspace 级外部平台账号。只存 credentialRef | `deletedAt` |
| PlatformSecret | AES-GCM 密文凭据。无明文 token 列 | `revokedAt` |
| Publication | 一次对外发布记录。不是 Video，也不是 Job | 不软删（审计） |
| PublicationMetricSnapshot | Publication 在 observedAt 的表现快照（新 Metrics SoT） | append-mostly，不软删 |
| Analytics | **DEPRECATED / NO NEW WRITES**。旧 Video 级快照。不要补 publicationId | 不删历史点；不迁数据 |
| RefreshToken | 未来刷新令牌哈希 | 过期/撤销后硬删 |
| AgentRun | 一次 Agent 执行记录 | 不软删（审计） |

枚举：

- `MembershipRole`：`OWNER` `ADMIN` `MEMBER` `EDITOR` `VIEWER`（V1.0 只用 OWNER）
- `ContentPlanStatus`：`DRAFT` `GENERATING` `READY` `CONFIRMED` `ARCHIVED`（业务只用 DRAFT / CONFIRMED / ARCHIVED）
- `ScriptStatus`：`DRAFT` `GENERATING` `READY` `CONFIRMED` `ARCHIVED`（业务只用 DRAFT / CONFIRMED / ARCHIVED）
- `VideoStatus`：`PENDING` `PROCESSING` `COMPLETED` `FAILED`（成片业务态；执行进度看 Job）
- `AssetType`：`IMAGE` `VIDEO` `AUDIO` `SUBTITLE` `DOCUMENT` `SOURCE_VIDEO` `SOURCE_AUDIO` `OTHER`
- `AssetStatus`：`PENDING` `PROCESSING` `READY` `FAILED`（软删用 `deletedAt`，无 `DELETED`）
- `AssetLinkRole`：`VIDEO_*` / `MOVIE_*`（见 schema）
- `JobKind`：`VIDEO_GENERATION` `MOVIE_EDITING` `TTS_GENERATION` `SUBTITLE_GENERATION` `VIDEO_COMPOSE` `VIDEO_PUBLISH` `PUBLICATION_METRICS_SYNC`
- `JobStatus`：`PENDING` `RUNNING` `COMPLETED` `FAILED` `CANCELLED`（无 `RETRYING`）
- `Platform`：`DOUYIN` `TIKTOK` `YOUTUBE` `XIAOHONGSHU` `BILIBILI` `CHANNELS` `MOCK`
- `PlatformAccountStatus`：`ACTIVE` `EXPIRED` `REVOKED` `DISCONNECTED`
- `PublicationMode`：`API` `MANUAL`
- `PublicationStatus`：`PENDING` `UPLOADING` `SUBMITTING` `PROCESSING` `PUBLISHED` `FAILED` `UNKNOWN_EXTERNAL_STATE` `CANCELLED`（无 `DRAFT`）
- `MetricSource`：`API` `MANUAL` `IMPORT`（无 `SCRAPE` / `MOCK` source）
- `SecretKind`：`PLATFORM_OAUTH`
- `AgentRunStatus`：`PENDING` `RUNNING` `COMPLETED` `FAILED` `CANCELLED`

---

## 4. tenant_id 设计

| 表 | tenant_id |
| --- | --- |
| users | **无** |
| refresh_tokens | **无**（按 user_id 检索） |
| tenants | 自身即租户 |
| memberships | 必填 |
| workspaces / projects / content_plans / scripts / videos / analytics / agent_runs / assets / asset_links / jobs / platform_accounts / platform_secrets / publications / publication_metric_snapshots | 必填 |

隔离硬墙只认 `tenant_id`。应用层查询必须带当前租户；跨租户对外 404。RLS 列已具备，策略 V2 再开。

---

## 5. workspace_id 设计

| 表 | workspace_id |
| --- | --- |
| users / tenants / memberships / refresh_tokens | 无 |
| workspaces | 自身 |
| projects / content_plans / scripts / videos / analytics / agent_runs / assets / asset_links / jobs / platform_accounts / platform_secrets / publications / publication_metric_snapshots | 必填 |

`Workspace.slug` 在 **租户内** 唯一（`@@unique([tenantId, slug])`），不是全局唯一。

`Script.contentPlanId`、`Video.scriptId` 可选。可选关联无法与必填 `tenantId` 组成 Prisma 复合外键，租户一致性由应用层在写入时校验（与 [auth-architecture.md](./auth-architecture.md) 一致）。

---

## 6. 索引策略

只为真实查询路径建索引，避免写放大。

| 索引 | 原因 |
| --- | --- |
| `users.email` UNIQUE | 登录按邮箱查找 |
| `tenants.slug` UNIQUE | URL / 注册时查租户 |
| `memberships (user_id, tenant_id)` UNIQUE | 防重复加入；判断「用户是否在租户内」 |
| `memberships (tenant_id)` | 列出某租户成员（UNIQUE 左前缀是 user_id，覆盖不了此查询） |
| `workspaces (tenant_id)` | 列出租户下空间 |
| `workspaces (tenant_id, slug)` UNIQUE | 租户内按 slug 取空间 |
| `workspaces (id, tenant_id)` UNIQUE | 复合外键被引用端 |
| `projects (tenant_id, workspace_id)` | 空间内项目列表 |
| `projects (tenant_id, created_at)` | 租户内按时间分页 |
| `projects (id, tenant_id)` UNIQUE | 被 ContentPlan / Script 等复合引用 |
| `content_plans (tenant_id, workspace_id, project_id)` | 项目下规划列表 |
| `content_plans (tenant_id, project_id, version)` UNIQUE | 同项目版本不覆盖 |
| `content_plans (tenant_id, status)` | 租户内按状态筛选 |
| `scripts (tenant_id, workspace_id, project_id)` | 项目下脚本 |
| `scripts (tenant_id, content_plan_id, topic_id, version)` UNIQUE | 同 Topic 版本不覆盖 |
| `scripts (tenant_id, status)` | 按状态取脚本 |
| `videos (tenant_id, workspace_id, project_id)` | 项目下视频 |
| `videos (script_id)` | 由脚本反查成片 |
| `videos (tenant_id, status)` | 处理中/失败监控 |
| `assets (tenant_id, workspace_id, project_id)` | 项目下素材列表 |
| `assets.storage_key` UNIQUE | 对象存储键不冲突 |
| `asset_links (asset_id)` / `(video_id)` / `(job_id)` | 按对象查链接 |
| `asset_links (tenant_id, video_id) WHERE role=VIDEO_OUTPUT` 部分唯一 | 每个 Video 至多一条成片输出 |
| `jobs (tenant_id, workspace_id, project_id)` | 项目下任务 |
| `jobs (tenant_id, status)` | 任务监控 |
| `jobs (video_id)` | 成片关联任务 |
| `jobs.locked_at` / `last_heartbeat_at` / `attempt` | Worker lease / crash recovery |
| `analytics (video_id, recorded_at)` | **legacy** 一条视频的时间序列。禁止新业务写入 |
| `analytics (tenant_id, recorded_at)` | **legacy** 租户复盘时间窗 |
| `publication_metric_snapshots (id, tenant_id)` UNIQUE | 租户内按 id 取快照 |
| `publication_metric_snapshots (tenant_id, publication_id, source, collection_key)` UNIQUE | 同一次采集幂等 |
| `publication_metric_snapshots (tenant_id, publication_id, observed_at)` | 一条作品的时间序列 |
| `publication_metric_snapshots (tenant_id, workspace_id, project_id, observed_at)` | 项目复盘时间窗 |
| `publication_metric_snapshots (tenant_id, platform, observed_at)` | 按平台复盘 |
| `refresh_tokens.token_hash` UNIQUE | 刷新时按哈希查找（永不存明文） |
| `refresh_tokens (user_id)` | 登出/改密撤销该用户全部令牌 |
| `refresh_tokens (expires_at)` | 过期清理任务 |
| `agent_runs (tenant_id, created_at)` | 租户内 Run 时间线 |
| `agent_runs (tenant_id, workspace_id, project_id)` | 项目下 Run 列表 |
| `agent_runs (tenant_id, status)` | 租户内按状态监控 |
| `agent_runs (agent_id, created_at)` | 按 Agent 排查 |
| `agent_runs (id, tenant_id)` UNIQUE | 复合外键被引用端 / 租户内按 id 取 Run |

不索引：`name`、`description`、`content`、计数指标、`user_agent`、JSONB 全文等。

---

## 7. ID 策略

比较：

| | UUID v4 | UUID v7 | CUID/CUID2 | ULID |
| --- | --- | --- | --- | --- |
| PostgreSQL 原生类型 | 是 | 是 | 否（text） | 否 |
| 时间有序 / 索引友好 | 差 | 好 | 较好 | 好 |
| Prisma 内置 | `uuid()` | `uuid(7)` | `cuid()` | 需额外库 |
| 跨 Node / Python / 任务队列 | 标准 | 标准 | JS 生态强 | 需约定 |
| 泄露业务量 | 不泄露 | 略含时间 | 不直接泄露 | 含时间 |

**选择：UUID v7，列类型 `uuid`。**

```prisma
id String @id @default(uuid(7)) @db.Uuid
```

原因：适合 PostgreSQL + Prisma + 未来多实例 Worker；B-tree 比随机 UUID 更稳；无需自增公开 ID；不引入 ULID 依赖。CUID 不是 PG 原生类型，Python 侧还要再实现一套。

禁止用自增整数作为对外业务 ID。

---

## 8. 删除策略

原则：核心业务**软删除**（`deleted_at`），外键 `onDelete: Restrict`，避免 CASCADE 抽走历史内容。

| 删除对象 | 数据库行为 | 应用约定（实现业务时） |
| --- | --- | --- |
| Tenant | Restrict 子表；行上 `deletedAt` | 先软删租户，下属资源只读/停写 |
| Workspace | Restrict 项目等；`deletedAt` | 软删空间，不级联擦项目 |
| Project | Restrict 规划/脚本/视频；`deletedAt` | 软删项目 |
| ContentPlan | Restrict 仍挂着的 Script；`deletedAt` | 软删规划，脚本保留 |
| Script | Restrict 仍挂着的 Video；`deletedAt` | 软删脚本，视频元数据保留 |
| Video | Restrict Analytics；`deletedAt` | 软删视频行，对象存储另议 |
| Asset | `deletedAt` | 软删元数据；对象由 StorageProvider 删除 |
| AssetLink | 硬删 | 关系解除 |
| Job | 不软删 | 审计/重试历史 |
| Membership | 硬删一行 | 用户离开租户 |
| RefreshToken | 用户硬删时 CASCADE；平时硬删过期行 | 无软删 |
| Analytics | 不随视频 CASCADE | **冻结**。快照保留到视频行还在。不要迁到 PublicationMetricSnapshot |
| PublicationMetricSnapshot | Restrict Publication / Tenant / Workspace / Project | 不随 Publication CASCADE |

软删后邮箱 / slug 仍受 UNIQUE 约束（占用），避免「删号立刻抢注」。V2 如需回收，再上部分唯一索引。

---

## 9. Migration 说明

- 目录：`database/prisma/migrations/`
- 第一份名称：`init_core_schema`
- Agent 执行记录：`add_agent_runs`
- ContentPlan 版本化：`add_content_plan_versioning`（`version` / `payload` / `positioning_snapshot` / `source_agent_run_id` / `CONFIRMED`）
- Script 版本化：`add_script_topic_versioning`（`topic_id` / `payload` / `topic_snapshot` / `source_agent_run_id` / `CONFIRMED`）
- Media Asset / Job / Video 扩展：`add_media_asset_job_video`（`assets` / `asset_links` / `jobs` / `videos.output_asset_id` / `videos.source_job_id`）
- Job Worker lease：`add_job_worker_lease`（`jobs.locked_at` / `last_heartbeat_at` / `attempt`，旧行默认 `attempt=0`、时间戳为空）
- Publishing 基础：`add_publishing_foundation`（`platform_accounts` / `platform_secrets` / `publications` / `JobKind.VIDEO_PUBLISH`）
- Publication Metrics 地基：`add_publication_metrics_foundation`（`MetricSource` / `publication_metric_snapshots` / `JobKind.PUBLICATION_METRICS_SYNC`）。**不** DROP / rename Analytics。
- 开发：`npm run db:migrate`（`prisma migrate dev`）
- CI / 干净环境：`npm run db:migrate:deploy`
- 回滚方式：Prisma 不以 down SQL 为一等公民。重建 = `DROP SCHEMA public CASCADE` + `migrate deploy`（测试已覆盖），或对开发库 `prisma migrate reset`

命令（仓库根）：

```bash
docker compose up -d postgres
copy database\.env.example database\.env
npm run db:generate
npm run db:migrate:deploy
npm run db:test
```

---

## 10. 未来 RLS 预留

V1.0 **不启用** RLS。已具备：

- 业务表均有 `tenant_id`（User / RefreshToken 除外）
- 复合外键降低串租写入
- 策略形态见 [auth-architecture.md](./auth-architecture.md) 第 5 节

V2：`ENABLE ROW LEVEL SECURITY` + `SET LOCAL app.current_tenant_id`。Prisma 仍必须自己带 `tenantId` 条件。

---

## 11. V1.0 范围（本阶段已做 / 未做）

**已做：** 十张核心表、枚举、索引、复合外键、migration、schema 测试、Docker Compose、`.env.example`。

**未做（禁止在本阶段补）：** 注册登录、JWT、Refresh 业务、前端、Agent、AI、视频生成、Redis、BullMQ。

**刻意未建的表：** Subscription、Usage、ApiKey、WorkspaceMembership（见认证设计 V2/V3）。

**刻意未加的列：** `Tenant.plan` / `Tenant.status`（计费阶段再加，避免空跑套餐字段）。

---

## 12. V2 / V3 扩展

| 版本 | 库变更 |
| --- | --- |
| V2 | RLS；Usage；ApiKey；邀请状态；部分唯一索引；`Tenant.plan` |
| V3 | Subscription；WorkspaceMembership；SSO 配置表；审计表 |

扩展只加表/列，不改 `tenant_id` 作为隔离根的语义。
