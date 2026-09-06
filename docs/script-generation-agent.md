# 脚本生成 Agent（script.generation:v1）

状态：**已实现。** 复用现有 Agent Engine / Registry / AgentRun / ModelRouter / PromptRegistry。  
不接 Video / Voice-Pro / FFmpeg / Douyin / SocialDataX / Redis / Topic 表。

设计原稿：[script-generation-agent-design.md](./script-generation-agent-design.md)。

---

## 1. 职责

`script.generation:v1` 根据已确认 ContentPlan 中的一条 Topic，生成可口播、可分镜的 `Script`。

```
CONFIRMED | ARCHIVED ContentPlan
  → payload.topics[topicId]
  → POST /scripts
  → Agent Engine → script.generation:v1
  → Script DRAFT（新 version，不覆盖旧行）
  → CONFIRMED → ARCHIVED
```

Topic 只从服务端 JSONB 读取，不建 Topic 表。客户端只传 `contentPlanId + topicId`。  
`ScriptsService` 不得直接调用 Model Provider。

底层通用入口 `POST /agents/runs` 仍保留，但 Script 业务主流程不要求前端自己调用它。

---

## 2. Script Schema

| 字段 | 说明 |
| --- | --- |
| tenantId / workspaceId / projectId | 隔离键，查询必须同时带上 |
| contentPlanId | 可空（兼容旧行）；新生成路径必填 |
| topicId | 可空（兼容旧行）；新生成路径必填 |
| title / content | 标题与旁白纯文本旁路 |
| status | 业务只用 `DRAFT` → `CONFIRMED` → `ARCHIVED` |
| version | 同一 `tenantId + contentPlanId + topicId` 递增 |
| payload | JSONB，完整 `ScriptOutput` |
| topicSnapshot | 创建时冻结当时的 Topic |
| sourceAgentRunId | 产生该脚本的 AgentRun，可空，**无外键** |
| createdAt / updatedAt / deletedAt | 时间与软删 |

历史枚举值 `GENERATING` / `READY` 仍留在数据库，业务代码不再写入。  
Migration：`add_script_topic_versioning`。

---

## 3. Version

- 版本范围：`tenantId + contentPlanId + topicId`
- 第一次 `version = 1`，再次生成 `2`、`3`…
- 禁止覆盖旧 Script
- 并发：`max(version) + 1`；唯一约束冲突则重查重试（最多 3 次）
- 不同 Topic / 不同 Project 各自从 1 开始
- 不引入 Redis / 分布式锁

`@@unique([tenantId, contentPlanId, topicId, version])`

---

## 4. Status

允许：

- `DRAFT → CONFIRMED`
- `CONFIRMED → ARCHIVED`

不允许（409 `SCRIPT_CONFLICT`）：

- `DRAFT → ARCHIVED`
- `CONFIRMED → DRAFT`
- `ARCHIVED → DRAFT`
- `ARCHIVED → CONFIRMED`
- PATCH `CONFIRMED` / `ARCHIVED`

执行态只在 AgentRun，不写回 Script。

---

## 5. Topic Snapshot

创建 Script 时把当时 `ContentPlan.payload.topics[]` 中的 Topic 完整写入 `topicSnapshot`。  
之后 ContentPlan 被修改或产生新版本，历史 Script 仍保持原 Topic。

---

## 6. Agent Input / Output

客户端只允许：

```
contentPlanId
topicId
targetDuration?     // 仅 15 / 30 / 45 / 60
requirements?       // 最长 2000
```

禁止客户端传：`tenantId` `workspaceId` `projectId` `userId` `topic` `positioning` `positioningSnapshot`。  
隔离键来自 JWT；`projectId` 来自 ContentPlan。

服务端组装 Agent 输入：

```
topic, positioning, targetDuration, requirements, platform, contentPlanId
```

不把 tenant / workspace / project / userId 放进模型业务输入。

Output（`ScriptOutput`，不要第二套字段）：

```
title
hook
opening
sections[{ sequence, narration, visualSuggestion, subtitle, duration }]
ending
cta
totalDuration
estimatedWordCount
voiceStyle
visualStyle
productionNotes[]
```

禁止 `visualPlan` / `fullVoiceover` / `voiceover`。  
流程：LLM → JSON Parse → Schema Validation → 保存 payload。失败：`AGENT_INVALID_OUTPUT`。  
`estimatedWordCount` 由服务端按旁白实算。`totalDuration` 必须等于 sections 时长之和，且在目标时长 ±5 秒。

Agent 配置：`temperature=0.4` `maxTokens=3500` `timeoutMs=60000`，`capabilities` 含 `script-generation`。  
Prompt：`prompts/script-generation.prompt.ts`。只输出 JSON，不要 Markdown / ```json。

---

## 7. API

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/scripts` | `agent:execute` | 调 script.generation:v1，落 DRAFT |
| GET | `/scripts?projectId=` | 登录 | 必填 projectId；可选 contentPlanId / topicId / status |
| GET | `/scripts/:id` | 登录 | 详情 |
| PATCH | `/scripts/:id` | `project:update` | 仅 DRAFT |
| POST | `/scripts/:id/confirm` | `project:update` | DRAFT → CONFIRMED |
| POST | `/scripts/:id/archive` | `project:update` | CONFIRMED → ARCHIVED |

`POST /scripts` 内部调用现有 `AgentsService.execute()`。  
查询一律 `findFirst({ id, tenantId, workspaceId })`，禁止先 `findUnique({id})` 再判租户。  
跨租户 / 跨 Workspace：404。无权限：403。

---

## 8. AgentRun

继续用 `agent_runs`。`agentId=script.generation` `agentVersion=v1`。  
记录 `requestId`、token 用量、状态。不保存 Prompt、API Key、完整敏感日志。  
删除 AgentRun **不会**删除 Script（`sourceAgentRunId` 无外键、无级联）。

---

## 9. 错误码

| 码 | 场景 |
| --- | --- |
| `CONTENT_PLAN_CONFLICT` | DRAFT 规划不允许生成脚本 |
| `CONTENT_PLAN_NOT_FOUND` | 规划不存在或越权 |
| `SCRIPT_TOPIC_NOT_FOUND` | Topic 不在该规划 topics[] |
| `SCRIPT_DURATION_NOT_AVAILABLE` | targetDuration 不是 15/30/45/60 |
| `SCRIPT_CONFLICT` | 非法状态流转或 PATCH 非 DRAFT |
| `SCRIPT_NOT_FOUND` | 跨租户 / 跨 Workspace / 不存在 |
| `AGENT_INVALID_OUTPUT` | 非 JSON 或 Schema 失败 |
| `AGENT_FORBIDDEN` | 无 `agent:execute` |
| `VALIDATION_ERROR` | 缺字段、伪造隔离键、超长 requirements |
| `MODEL_TIMEOUT` / `MODEL_REQUEST_FAILED` / `MODEL_PROVIDER_NOT_CONFIGURED` | Provider 失败 |

---

## 10. 前端

`/dashboard/scripts`：选择 ContentPlan / Topic / 时长 / 要求，生成中…，列表显示标题、Topic、版本、状态、创建时间、规划、时长。  
`/dashboard/scripts/[id]`：Hook / Opening / Sections / Ending / CTA / Voice Style / Visual Style / Production Notes。  
DRAFT 可编辑并确认；CONFIRMED / ARCHIVED 只读。不暴露 Prompt / API Key / JWT / Refresh Token。

---

## 11. 测试结果

- Backend unit：54 passed / 3 skipped（真实模型 opt-in）
- Backend e2e：7 files / 47 passed
- Database：13 passed
- 真实模型：`AGENT_REAL_MODEL_TEST=true` 时可跑；无 Key 时 skip。本次 Router One COMPLETED，日志仅 hash / length / token
