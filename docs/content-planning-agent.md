# 内容规划 Agent（content.planning:v1）

状态：**已实现。** 复用现有 Agent Engine / Registry / AgentRun / ModelRouter / PromptRegistry。  
可消费当前 Project 的 compact historical performance feedback。不接 SocialDataX、Redis、BullMQ、Topic 表。不改 script.generation / account.positioning。

配套设计原稿：[content-planning-agent-design.md](./content-planning-agent-design.md)。

---

## 1. 职责

`content.planning:v1` 根据账号定位快照和规划参数，生成一份可版本化的 `ContentPlan`。

```
account.positioning:v1
        ↓
POST /content-plans
        ↓
Agent Engine → content.planning:v1 → ModelRouter
        ↓
ContentPlanOutput（JSON Schema 校验）
        ↓
ContentPlan DRAFT（新 version，不覆盖旧行）
        ↓
人工确认 → CONFIRMED → 禁止 PATCH
        ↓
归档 → ARCHIVED（不可恢复）
```

AgentRun 记录 AI 执行。ContentPlan 是业务资产。删除 AgentRun **不会**删除 ContentPlan（`sourceAgentRunId` 无外键、无级联）。

未来 Script Agent 用 `contentPlanId + topicId` 定位一条 Topic。本阶段不实现 Script Agent。

---

## 2. ContentPlan 字段

| 字段 | 说明 |
| --- | --- |
| tenantId / workspaceId / projectId | 隔离键，查询必须同时带上 |
| title / description | 标题与摘要 |
| status | `DRAFT` → `CONFIRMED` → `ARCHIVED` |
| version | 同一 `tenantId + projectId` 递增，数据库唯一 |
| payload | JSONB，完整 `ContentPlanOutput` |
| positioningSnapshot | 创建时完整拷贝当时的账号定位输出 |
| sourceAgentRunId | 产生该规划的 AgentRun，可空，无级联 |
| planningDays / postsPerDay / platform / usedTrendData | 便于列表筛选 |
| createdAt / updatedAt / deletedAt | 时间与软删 |

历史枚举值 `GENERATING` / `READY` 仍留在数据库，业务代码不再写入。

---

## 3. 版本机制

- 同一项目每次生成都是新行：v1、v2、v3…
- `@@unique([tenantId, projectId, version])`
- 不同项目各自从 1 开始
- 确认后的版本禁止 PATCH。需要改内容：再生成新版本

---

## 4. payload 与 Topic

`payload` 保存完整 `ContentPlanOutput`：

```
title, summary, planningDays, postsPerDay, platform,
contentStyle?, additionalRequirements?,
pillarAllocation[], usedTrendData, trendNote, topics[]
```

每个 Topic：

```
id, dayIndex, title, hook, contentPillar, targetAudience,
painPoint, contentAngle, format, estimatedDuration,
priority, reason, keywords[], cta, status, scheduledDate?
```

`id` 由系统写成稳定 UUID，不使用模型随意字符串。V1 **不建 Topic 表**。

无趋势数据时服务端强制：

- `usedTrendData = false`
- `trendNote = "未使用实时趋势数据"`

---

## 5. positioningSnapshot

创建时必须保存当时 `account.positioning:v1` 的完整成功输出。  
只存 `positioningRunId` 不够：定位以后重跑成 v2，不能改写已经生成的规划。

---

## 6. 状态机

允许：

- `DRAFT → CONFIRMED`
- `CONFIRMED → ARCHIVED`

不允许（409 `CONTENT_PLAN_CONFLICT`）：

- `ARCHIVED → DRAFT` / `ARCHIVED → CONFIRMED`
- `CONFIRMED → DRAFT`
- `DRAFT → ARCHIVED`
- PATCH `CONFIRMED` / `ARCHIVED`

---

## 7. Agent 输入 / 输出

Input（禁止 `tenantId` / `workspaceId` / `projectId` / `userId`）：

```
positioning
planningDays          // V1 只能是 7，否则 CONTENT_PLAN_DAYS_NOT_AVAILABLE
postsPerDay           // 1-5
platform
contentStyle?
additionalRequirements?
positioningRunId?     // 若提供，服务端按租户+空间+项目加载 COMPLETED 的 account.positioning
trendData?            // 可选；V1 默认 EmptyTrendDataProvider
performanceFeedback?  // 可选；服务端每次 run 前按当前 Project 历史 Publication 即时构建，客户端传入会被覆盖
```

Output：经 JSON parse + Schema 校验后的 `ContentPlanOutput`。失败：`AGENT_INVALID_OUTPUT`。  
禁止把模型原文当成功结果保存。

V1 上限：`7 × 5 = 35` 条 Topic。14 / 30 / 60 天尚未开放。

Output 合同不变，不把 feedback 写入 ContentPlan.payload。实际送给模型的 compact feedback 记在 `AgentRun.input.performanceFeedback`。

规划优先级：账号定位 > 用户当前要求 > 项目上下文 > 历史表现反馈。Feedback 是观察不是因果，不能覆盖定位。

---

## 8. 定位来源

- 模式 A：客户端提交合法 `positioning`
- 模式 B：提交 `positioningRunId`

`positioningRunId` 必须同时满足：当前 tenant、workspace、project，`agentId = account.positioning`，`status = COMPLETED`。跨范围 404。错误 Agent / 未完成：400。

隔离键只来自 JWT / AgentContext，不信任客户端伪造。

---

## 9. API

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/content-plans` | `agent:execute` | 调 content.planning:v1，落 DRAFT |
| GET | `/content-plans?projectId=` | 登录 | 项目下列表 |
| GET | `/content-plans/:id` | 登录 | 详情 |
| PATCH | `/content-plans/:id` | `project:update` | 仅 DRAFT |
| POST | `/content-plans/:id/confirm` | `project:update` | DRAFT → CONFIRMED |
| POST | `/content-plans/:id/archive` | `project:update` | CONFIRMED → ARCHIVED |

`POST /content-plans` 内部调用现有 `AgentsService.execute()`，不另写一套 Executor。  
也可以直接 `POST /agents/runs` 跑 `content.planning:v1`，再由业务接口落库。

查询一律 `findFirst({ id, tenantId, workspaceId })`。跨租户 404，权限不足 403。

---

## 10. 模型与趋势

只走 `ModelRouter.generate()`。`NODE_ENV=test` 或未配 `MODEL_*` 用 Mock。开发环境按现有 `MODEL_*` 走 Real Provider。

`TrendDataProvider` 接口 + `EmptyTrendDataProvider`。Agent **不得** import SocialDataX。

Prompt：`agents/prompts/content-planning.prompt.ts`，版本 `content.planning:v1`。日志默认不打印完整 Prompt / 模型响应 / API Key / Token。

---

## 11. 前端

最小页：`/dashboard/content-planning`。读取项目最近一次成功定位，设置 7 天 / 每天条数 / 平台 / 风格 / 额外要求，生成、展示 Topic、确认、归档。不做完整日历或拖拽。
