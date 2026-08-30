# 用户系统与多租户架构设计

状态：设计完成，**未实现**。  
范围：User / Tenant / Workspace / 认证 / 权限 / 隔离 / SaaS 预留。  
依据：[PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)、[architecture.md](./architecture.md)。

---

## 1. 架构结论

**采用方案 B：User → Tenant → Workspace。**

V1.0 面向个人开发者，注册后系统静默创建：

1. 一个 `User`
2. 一个 `Tenant`（UI 不暴露「租户」一词）
3. 一个默认 `Workspace`
4. 一条 `Membership`（`role = owner`）

对用户表现为「一个账号 + 一个工作空间」。底层按未来 SaaS 的隔离根与计费根建模，避免日后把 Workspace 硬升成租户。

| 概念 | 含义 | V1.0 对外 |
| --- | --- | --- |
| User | 自然人身份，可加入多个租户 | 邮箱账号 |
| Tenant | 计费、套餐、数据隔离、合规主体 | 隐藏，自动创建 |
| Workspace | 项目 / Agent / 内容的协作容器 | 「工作空间」 |

不采用方案 A（User → Workspace 兼隔离根）。原因见第 2 节。

---

## 2. User / Tenant / Workspace 关系

### 2.1 方案比较

**方案 A：User → Workspace**

Workspace 同时承担协作空间、数据隔离和计费主体。

| 优点 | 缺点 |
| --- | --- |
| V1.0 模型最少，少一张表 | 企业下一份合同、多个空间时，计费与隔离无法拆开 |
| 个人用户心智简单 | 用户加入多个空间后，套餐/用量只能绑在 Workspace 上，无法做「组织级」账单 |
| 查询少一层 | SSO、企业席位、审计日志只能补丁式加「组织」 |
| | 权限若只活在 Workspace，跨空间的 Billing Admin 无处安放 |
| | 日后拆 Tenant 需要改几乎所有表的外键语义 |

**方案 B：User → Tenant → Workspace**

Tenant 是硬隔离与计费根；Workspace 是产品协作边界。

| 优点 | 缺点 |
| --- | --- |
| 个人 / 团队 / 企业共用一套模型 | V1.0 多一张 Tenant 表、业务行多一个 `tenant_id` |
| 一份订阅覆盖一个租户下多个 Workspace | 必须纪律：所有业务查询带租户上下文 |
| 用户可加入多个 Tenant；Tenant 内多 Workspace、多成员 | 文档与代码要分清「身份」与「租户」 |
| API Key、用量、套餐自然挂在 Tenant | |
| 与已定原则「业务预留 `tenant_id`」一致 | |

针对本项目的长期约束：

| 场景 | 方案 A | 方案 B |
| --- | --- | --- |
| 个人用户 | 够用 | 自动 1:1:1，体验等价 |
| 团队协作 | Workspace 当团队，计费别扭 | Membership + 多 Workspace |
| 企业客户 | 难做组织级合同与 SSO | Tenant = 企业主体 |
| SaaS 多租户隔离 | 用 workspace_id 冒充租户，语义会漂 | `tenant_id` 是唯一硬墙 |
| 未来计费 | 按空间拆账单或事后聚合 | 订阅挂 Tenant，用量可下钻 Workspace |
| 未来权限 | 角色绑死在空间 | 租户角色 + 预留空间角色 |

**选择方案 B。** 个人期把复杂度藏在注册流程里；SaaS 期不必翻数据模型。

### 2.2 关系图

```
                         User（全局身份，无 tenant_id）
                           │
                           │  N:N
                           ▼
                    Membership
                    (tenant_id, user_id, role)
                           │
                           ▼
                         Tenant
                    （隔离根 / 计费根）
                           │ 1:N
                           ▼
                       Workspace
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
       Project           Agent             Task
          │                │                │
          ▼                ▼                ▼
       Content           Video            Usage

Tenant 1:1..N  Subscription
Tenant 1:N     ApiKey
Tenant 1:N     Usage（可带 workspace_id 下钻）
User   1:N     RefreshToken / Session
```

未来（不在 V1.0 实现）：

```
User ── WorkspaceMembership ── Workspace     （空间内角色可与租户角色不同）
User ── 多个 Tenant（通过多条 Membership）
Tenant ── 多个 Workspace
```

### 2.3 基数（目标态）

- 一个 User 可加入多个 Tenant
- 一个 Tenant 可有多个 User
- 一个 Tenant 可有多个 Workspace
- 一个 Workspace 只属于一个 Tenant
- 一个 User 在同一 Tenant 内只有一条 Membership
- V1.0 实际基数：1 User : 1 Tenant : 1 Workspace : 1 Owner Membership

---

## 3. Entity 设计

以下实体**只设计，不建表、不写 Prisma、不迁移**。  
类型按语义描述；实现阶段再用 Prisma 落地。

### 3.1 User

**职责：** 登录身份。不是隔离单元，也不挂套餐。

| 字段 | 说明 |
| --- | --- |
| `id` | UUID PK |
| `email` | 唯一，小写规范化 |
| `password_hash` | 仅存哈希（实现阶段再定算法） |
| `display_name` | 展示名 |
| `status` | `active` / `disabled` |
| `email_verified_at` | V1.0 可空，预留验证 |
| `last_login_at` | 可空 |
| `created_at` / `updated_at` / `deleted_at` | 软删 |

**不要有 `tenant_id`。** 用户与租户只通过 Membership 关联。

**扩展：** 头像、时区、第三方账号绑定表（V2+，独立表，不塞进 User）。

### 3.2 Tenant

**职责：** 数据隔离根、订阅主体、未来企业主体。

| 字段 | 说明 |
| --- | --- |
| `id` | UUID PK |
| `name` | 内部名；V1.0 可用「{display_name} 的工作台」 |
| `slug` | 全局唯一，V2 用于 URL / API；V1.0 可自动生成 |
| `plan` | `free` / `pro` / `team` / `enterprise`，默认 `free` |
| `status` | `active` / `suspended` / `deleted` |
| `owner_user_id` | 冗余便捷字段；权威以 Membership `role=owner` 为准 |
| `created_at` / `updated_at` / `deleted_at` | 软删 |

**扩展：**  ent 域名、SSO 配置、税号、品牌（V3 Enterprise）。

### 3.3 Workspace

**职责：** 项目与 Agent 的产品容器。从属于 Tenant。

| 字段 | 说明 |
| --- | --- |
| `id` | UUID PK |
| `tenant_id` | **必填**，隔离键 |
| `name` | 展示名 |
| `slug` | 租户内唯一 |
| `status` | `active` / `archived` |
| `created_by_user_id` | 创建者 |
| `created_at` / `updated_at` / `deleted_at` | 软删 |

**扩展：** 默认模型偏好、品牌/账号定位缓存（业务模块设计时再定，不放认证核心）。

### 3.4 Membership

**职责：** User 在某个 Tenant 内的成员关系与角色。V1.0 的权限唯一来源。

| 字段 | 说明 |
| --- | --- |
| `id` | UUID PK |
| `tenant_id` | 必填 |
| `user_id` | 必填 |
| `role` | `owner` / `admin` / `member`（枚举，V1.0 不用 Role 表） |
| `status` | `active` / `invited` / `disabled` |
| `invited_by_user_id` | 可空 |
| `joined_at` | 可空（邀请接受时写入） |
| `created_at` / `updated_at` | |

**约束：** `UNIQUE(tenant_id, user_id)`。每个 Tenant 至少保留一名 `owner`。

**扩展：** `WorkspaceMembership`（V2）—— 同一人在不同 Workspace 可有不同角色。V1.0 不建此表；约定「租户成员可访问该租户下全部 Workspace」。

### 3.5 Role

**V1.0：** 不是独立表，是 Membership 上的枚举。

**V2/V3：** 可引入 `Role` + `Permission` + `RolePermission`，支持自定义角色。现有枚举值保持兼容。

预留角色名（不实现）：`editor`、`viewer`、`billing_admin`。

### 3.6 Session / RefreshToken

**职责：** 可撤销的登录凭证存储。Access JWT **不入库**；Refresh Token **只存哈希**。

| 字段 | 说明 |
| --- | --- |
| `id` | UUID PK |
| `user_id` | 必填 |
| `tenant_id` | 签发时的当前租户上下文，可空（仅个人期也建议写入） |
| `token_hash` | 刷新令牌哈希 |
| `expires_at` | |
| `revoked_at` | 可空 |
| `user_agent` / `ip` | 审计，可空 |
| `created_at` | |

**不需要** 作为业务资源做 RLS（按 `user_id` 查找，登出/轮换时校验归属）。  
**不要** 把明文 refresh token 写入数据库。

### 3.7 Subscription

**职责：** 租户级套餐与账期。挂在 Tenant，不挂 User。

| 字段 | 说明 |
| --- | --- |
| `id` | UUID PK |
| `tenant_id` | 必填，建议 1 个 Tenant 当前 1 条有效订阅 |
| `plan` | 与 Tenant.plan 对齐 |
| `status` | `trialing` / `active` / `past_due` / `canceled` |
| `seats` | Team/Enterprise 席位，Free/Pro 可为 1 |
| `current_period_start` / `current_period_end` | |
| `provider` | V2，如 stripe |
| `provider_subscription_id` | V2 |
| `created_at` / `updated_at` | |

V1.0 **不实现**此表。过渡期只用 `Tenant.plan = free`。

### 3.8 Usage

**职责：** 用量计量，供限额与未来账单。

两种互补形态（实现阶段二选一或并存）：

**明细事件（可选，审计/对账）**

| 字段 | 说明 |
| --- | --- |
| `id` | UUID PK |
| `tenant_id` | 必填 |
| `workspace_id` | 可空，下钻 |
| `user_id` | 触发者，可空（系统任务） |
| `metric` | 见 9.2 |
| `quantity` | |
| `occurred_at` | |

**周期聚合（限额判断主路径）**

| 字段 | 说明 |
| --- | --- |
| `id` | UUID PK |
| `tenant_id` | 必填 |
| `workspace_id` | 可空 |
| `metric` | |
| `period` | 如 `2026-08` 或 period_start/end |
| `used` | |
| `limit_snapshot` | 周期开始时套餐限额快照，可空 |

V1.0 **不实现**。Backend 在跑通 Agent 前再设计写入点。

### 3.9 ApiKey

**职责：** 机器访问租户资源。属于 Tenant，可选绑定 Workspace。

| 字段 | 说明 |
| --- | --- |
| `id` | UUID PK |
| `tenant_id` | 必填 |
| `workspace_id` | 可空 = 租户级 |
| `name` | |
| `key_prefix` | 展示用，如 `acf_live_ab12` |
| `key_hash` | 只存哈希 |
| `scopes` | 字符串数组或位标记，V2 再定 |
| `created_by_user_id` | |
| `last_used_at` / `expires_at` / `revoked_at` | |
| `created_at` | |

V1.0 **不实现**。认证只走邮箱密码。

### 3.10 后续业务实体（本设计只定隔离键）

实现各业务模块时必须带上下列键，本阶段不展开字段：

| 实体 | `tenant_id` | `workspace_id` | `user_id`（审计/归属） |
| --- | --- | --- | --- |
| Project | 必填 | 必填 | created_by |
| Agent 运行配置 / 定义 | 必填 | 必填 | created_by |
| Task | 必填 | 必填 | requested_by |
| Content | 必填 | 必填 | created_by |
| Video | 必填 | 必填 | created_by |
| 数据复盘记录 | 必填 | 必填 | 可空 |

业务行**同时冗余 `tenant_id` 与 `workspace_id`**，禁止只存 `workspace_id` 再 join 推断租户（防止 join 写错导致串租）。

---

## 4. 数据隔离策略

### 4.1 三键语义

| 键 | 语义 | 谁写入 |
| --- | --- | --- |
| `user_id` | 谁做的 / 谁拥有身份 | 认证上下文 |
| `tenant_id` | 数据属于哪一个隔离域（硬墙） | 当前租户上下文，**禁止客户端自选未授权租户** |
| `workspace_id` | 数据属于哪一个协作空间（软边界） | 当前空间；必须属于当前 `tenant_id` |

请求进入 Backend 后解析凭证，得到 `user_id` + `tenant_id` + `workspace_id` + `role`。此后所有业务读写使用服务端上下文，不信任 body 里的租户/空间 ID（若传入则必须与上下文一致，否则视为隔离违规）。

### 4.2 哪些表必须有 `tenant_id`

**必须有：** Workspace、Membership、Project、Agent、Task、Content、Video、分析/复盘、Subscription、Usage、ApiKey、邀请、以及一切「属于某客户」的业务表。

**必须没有：** User（全局身份）。

**按 user 检索、可选带 tenant 上下文：** RefreshToken / Session。

**系统表：** 枚举、迁移、全局功能开关——无 `tenant_id`。

### 4.3 哪些表必须有 `workspace_id`

**必须有：** Project、Agent、Task、Content、Video、复盘、以及只在某一工作空间内有意义的资源。

**不应有：** User、Tenant、Membership（成员关系在租户级）、Subscription（租户级账单）、RefreshToken。

**可空：** Usage、ApiKey（租户级或空间级）。

### 4.4 哪些表不需要 `user_id` 作为隔离键

`user_id` 不作隔离墙，只作归属/审计。隔离只认 `tenant_id`。  
「资源属于当前用户」是权限规则，不是租户隔离。

### 4.5 防跨租户读取（强制）

1. **应用层：** 每个业务查询/更新/删除的 WHERE 必须包含 `tenant_id = currentTenantId`。
2. **校验层：** 用 `workspace_id` 取资源后，断言 `resource.tenant_id === currentTenantId` 且 `workspace.tenant_id === currentTenantId`。
3. **数据库层（V2 启用 RLS）：** 即使漏写 WHERE，默认也不可见其他租户行。
4. **跨租户访问对外表现为资源不存在（404）**，不返回 403「属于别人」。403 仅用于「同一租户内角色不够」。
5. **Worker / AI Engine** 写入时必须使用任务载荷中的 `tenant_id`，禁止用「默认租户」或环境变量里的单租户 ID。
6. **禁止** 管理后台或脚本用应用连接串无条件 `SET ROLE` 关掉 RLS 后跑日常业务。

---

## 5. RLS 设计原则

V1.0 **先落列和约束，不启用 RLS**（避免单人本地开发被策略绊住）。V2 多真实租户上线前启用。原则现在定死：

1. 业务表启用 `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`（表 Owner 也不自动旁路）。
2. 会话变量：`SET LOCAL app.current_tenant_id = '<uuid>'`，由 Backend 在**每个请求/每个 Job 的事务开头**设置。
3. 策略谓词（示意）：`tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`。
4. 未设置 `app.current_tenant_id` 时策略失败（零行），防止忘设上下文变成「全表可见」。
5. 迁移角色 / 超级用户走独立 role，不给应用账号 `BYPASSRLS`。
6. User、系统表不套租户 RLS；User 的读取通过认证与 Membership 授权，不做「按租户切 User 全表」。
7. Prisma 仍写 `tenant_id` 条件；RLS 是第二道墙，不是第一道的替代。
8. 跨库逻辑备份、分析副本同样带策略或只读脱敏，不在文档外开后门。

---

## 6. 认证方案

### 6.1 方案比较

| | JWT（长寿命单令牌） | Session Cookie | JWT Access + Refresh Token |
| --- | --- | --- | --- |
| 撤销 | 难，除非黑名单（退化成 session） | 删行即失效 | 撤 refresh；access 短过期 |
| Next.js Web | 能用，存 localStorage 有 XSS 风险 | 最顺，要注意 CSRF | refresh 放 httpOnly Cookie |
| Tauri 桌面 | 好存 | Cookie/自定义协议别扭 | access 内存；refresh 走系统安全存储，调同一套 API |
| NestJS | 校验签名即可 | 要 session 存储 | 中间件验 access；/auth/refresh 验哈希 |
| 未来 SaaS / 开放 API | 常见 | 对 API 客户端不友好 | 人用 refresh；机器用 ApiKey（V2） |
| 多租户声明 | 可放 claim | 存在 session 行 | access claim 带 `tid` / `wid` / `role` |

### 6.2 最终选择

**JWT Access Token + 可撤销 Refresh Token。**

原因：

- 产品路径是 **Web → Tauri 桌面 → 未来 SaaS API**，凭证模型必须同时服务 Cookie 世界和原生安全存储，不能绑死在浏览器 Session。
- 纯长寿命 JWT 无法在密码修改、禁用用户、切换租户策略时立刻失效。
- 纯 Session Cookie 对桌面端和未来 API Key 是两套完全不同的模型，后期要拆。
- Access 短寿命（建议 15 分钟量级）降低泄露窗口；Refresh 入库哈希、轮换、可按设备撤销。

V1.0 认证因子：**仅邮箱 + 密码**。不做 OAuth、验证码登录、Passkey。

### 6.3 令牌内容（设计，不实现）

**Access JWT（不入库）**

- `sub`：`user_id`
- `tid`：当前 `tenant_id`
- `wid`：当前 `workspace_id`
- `role`：当前租户角色
- `ver`：密码/会话版本（改密后旧 access 即使未过期也可拒）
- `exp` / `iat` / `iss`

**Refresh Token**

- 随机高熵，只把哈希写入 `RefreshToken`
- Web：`HttpOnly` + `Secure` + `SameSite=Lax`（或 CSRF 双 Cookie）
- Tauri：操作系统凭证库，请求头或专用 refresh 接口，**同一 Backend 契约**
- 使用后轮换（rotation）；重用已轮换的 token 视为盗窃，撤销该用户该租户下全部 refresh

### 6.4 明确不做

- 第三方登录
- 把 JWT 当唯一长期凭证
- 前端本地伪造 `tid` / `wid` 切换租户（切换必须走 Backend 重签）
- AI Engine 或 Worker 签发用户令牌

---

## 7. 权限方案

### 7.1 V1.0 三角色

作用域：**Tenant**。V1.0 仅一个 Workspace，租户角色即空间权限。

| 能力 | Owner | Admin | Member |
| --- | --- | --- | --- |
| 查看本租户项目 / 内容 / 任务 | 是 | 是 | 是 |
| 创建与运行 Agent / 生成内容与视频 | 是 | 是 | 是 |
| 管理本租户全部业务资源 | 是 | 是 | 是（V1.0 不区分「仅自己创建」；V2 收紧） |
| 邀请 / 移除成员 | 是 | 是 | 否 |
| 修改他人角色 | 是（不可撤走最后一名 Owner） | 是（不可改 Owner） | 否 |
| 创建 / 归档 Workspace | 是 | 是 | 否 |
| 删除 Tenant / 注销组织 | 是 | 否 | 否 |
| 转让 Owner | 是 | 否 | 否 |
| 计费与套餐（未来） | 是 | 否 | 否 |
| 管理 API Key（未来） | 是 | 是 | 否 |

V1.0 实际只有 Owner（注册人）。`admin` / `member` 枚举写入模型，UI 不做成员管理。

### 7.2 未来角色（不实现）

| 角色 | 意图 |
| --- | --- |
| Editor | 做内容与任务，不能管成员与计费 |
| Viewer | 只读 |
| Billing Admin | 只管订阅与发票，不碰内容 |

与 WorkspaceMembership 同时出现时：有效权限 = 租户角色与空间角色的交集（更严者生效），具体矩阵留 V2。

### 7.3 判定顺序

1. 已认证？否则 `AUTH_*`（401）
2. User / Tenant / Membership 均为 active？否则 401/403
3. 资源 `tenant_id` 匹配？否则 **404**
4. 资源 `workspace_id` 属于该租户且匹配当前空间（若接口有空间作用域）？否则 404
5. 角色允许该操作？否则 403 `AUTH_FORBIDDEN`

---

## 8. API 与系统边界

```
[Frontend / 未来 Tauri]
        │  仅 HTTPS 调 Backend
        ▼
[Backend / NestJS]     认证、鉴权、配额、投递任务
        │
        ├──► PostgreSQL     唯一业务真相；Frontend 禁止直连
        ├──► Redis/BullMQ   任务载荷必须带 tenant_id / workspace_id / user_id
        └──► AI Engine      内部服务凭证，不转发用户密码/refresh
                │
                ▼
             Worker 可调 AI Engine 或写回结果；不改 Membership / 不签发令牌
```

| 层 | 负责 | 禁止 |
| --- | --- | --- |
| Frontend | UI、交互、调用 Backend | 直连数据库；直调模型；信任本地改写的 tenant/workspace |
| Backend | 认证鉴权、租户上下文、业务规则、配额、入队、调 AI Engine | 在此进程内跑重模型推理 |
| AI Engine | Agent 图、模型调用、按任务出结果 | 用户认证；读 User 密码；按「当前登录用户」自行切租户 |
| Worker | 异步执行、回写任务状态与产物 | 绕过 Backend 改角色/成员；不带 `tenant_id` 写库 |
| Database | 持久化、唯一约束、未来 RLS | 不承载产品鉴权逻辑的全部责任（应用层仍要过滤） |

内部调用约定（实现阶段再落）：

- Backend → AI Engine：服务间令牌 + 任务信封 `{ tenant_id, workspace_id, user_id, task_id }`
- Worker 消费同一信封；写库 API 必须带齐隔离键
- AI Engine 不持有最终用户 JWT

---

## 9. SaaS 扩展设计

### 9.1 套餐（字段预留，不实现）

挂在 `Tenant.plan`，账期细节在 `Subscription`。

| | Free | Pro | Team | Enterprise |
| --- | --- | --- | --- | --- |
| 定位 | V1.0 个人默认 | 重度个人 | 小团队 | 企业 |
| 席位 | 1 | 1–3（可调） | `Subscription.seats` | 合同 |
| Workspace 数 | 1 | 少量 | 多个 | 不限 / 合同 |
| 成员与角色 | 仅 Owner | 可选 | Admin/Member | 自定义 + SSO |
| API Key | 否 | 可选 | 是 | 是 |
| 限额 | 最低 | 提高 | 按席位 | 定制 |
| 支持 | 自助 | 邮件 | 优先 | SLA |

套餐变更只改 Tenant/Subscription，不改业务表结构。

### 9.2 用量指标

| `metric` | 含义 | 建议周期 |
| --- | --- | --- |
| `ai_calls` | AI 调用次数（一次 Agent 步或一次模型请求，实现时定义） | 月 |
| `video_generations` | 视频生成成功次数 | 月 |
| `storage_bytes` | 对象存储占用 | 瞬时或日快照 |
| `task_count` | 异步任务创建数 | 月 |
| `token_input` / `token_output` | V2 成本核算 | 月 |

限额来源：`plan` → 配置表或代码常量表（V2 可数据化）。超限由 **Backend 在入队前** 拒绝，错误码 `QUOTA_EXCEEDED`。AI Engine / Worker 可做二次校验，但不能作为唯一闸门。

### 9.3 需要的库字段（汇总预留）

- Tenant：`plan`、`status`
- Subscription：整表 V2
- Usage / UsagePeriod：整表 V2
- ApiKey：整表 V2
- Membership：`role`、`status` 已够 Team
- RefreshToken：已够多设备与撤销

---

## 10. 安全与错误设计

### 10.1 统一错误体

所有 Backend JSON 错误使用同一外形（实现阶段遵守）：

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "可读说明",
    "details": {}
  }
}
```

- `code`：稳定、机器可读，Frontend 只依赖 code
- `message`：可展示；**不**包含堆栈、SQL、其他租户 ID
- `details`：可选字段级校验，不得泄露隔离信息

### 10.2 错误码与 HTTP

| 场景 | code | HTTP |
| --- | --- | --- |
| 邮箱或密码错误（不可区分以免枚举） | `AUTH_INVALID_CREDENTIALS` | 401 |
| Access 过期或无效 | `AUTH_SESSION_EXPIRED` | 401 |
| Refresh 失效/重用检测 | `AUTH_TOKEN_REVOKED` | 401 |
| 已登录但角色不足 | `AUTH_FORBIDDEN` | 403 |
| 租户不存在或当前用户不可见 | `TENANT_NOT_FOUND` | 404 |
| 租户停用 | `TENANT_SUSPENDED` | 403 |
| Workspace 不存在或不可见 | `WORKSPACE_NOT_FOUND` | 404 |
| 资源主键存在但 `tenant_id` 不匹配 | 对外 `RESOURCE_NOT_FOUND` | 404 |
| 同上，仅日志 | 对内 `RESOURCE_TENANT_MISMATCH` | （不返回给客户端） |
| API Key 无效（V2） | `API_KEY_INVALID` | 401 |
| API Key 已撤销（V2） | `API_KEY_REVOKED` | 401 |
| 超额（V2） | `QUOTA_EXCEEDED` | 429 或 403 |

### 10.3 安全边界

- 密码只存哈希；日志禁止明文密码、Access、Refresh、ApiKey 全文。
- 跨租户一律当 404；审计日志记录真实 `RESOURCE_TENANT_MISMATCH`。
- API Key 泄露：前缀展示 + 哈希存储；支持即时 `revoked_at`；泄漏应急 = 撤钥匙 + 轮换 refresh + 可选强制 `ver++`。
- Session 过期：access 过期走 refresh；refresh 过期必须重新登录。
- 改密、禁用用户：提升 User 会话版本并撤销其 refresh。
- CORS、Cookie 域、Tauri 自定义协议白名单在实现认证时单独立项，本设计不展开。

---

## 11. V1.0 范围

实现用户系统时（**不是本文档阶段**）只做：

1. User：邮箱 + 密码
2. 注册事务内创建 Tenant + 默认 Workspace + Owner Membership
3. 登录：Access JWT + Refresh Token
4. 登出：撤销当前 refresh
5. `GET` 当前用户 / 当前租户 / 当前 Workspace（只读引导）
6. 此后所有业务表从第一张起带 `tenant_id`；空间内资源带 `workspace_id`
7. 应用层强制租户条件；角色枚举写入 Membership

V1.0 **不做：**

- 邀请、多成员 UI、角色切换 UI
- 多 Workspace 创建/切换 UI（库允许 1:N，接口可先写死默认空间）
- Subscription / Usage / ApiKey
- PostgreSQL RLS
- 第三方登录
- 邮箱验证强制门禁（字段预留即可）

---

## 12. V2 / V3 预留

| 版本 | 内容 |
| --- | --- |
| V2 | 邀请与三角色落地；多 Workspace；Refresh 多设备管理；Usage 计量与套餐限额；ApiKey；启用 RLS；Editor/Viewer 矩阵 |
| V3 | Billing Admin；Subscription 对接支付；Team/Enterprise 席位；SSO；自定义角色；WorkspaceMembership；审计导出；企业隔离增强 |

预留方式：列与枚举先在模型里留好；表（Subscription、Usage、ApiKey、WorkspaceMembership）到对应版本再创建。**不要**为未做功能提前写业务代码。
