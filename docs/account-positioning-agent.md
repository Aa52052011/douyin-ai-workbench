# Account Positioning Agent

状态：`account.positioning:v1` 已接入现有 Agent Engine。  
不绕过 Registry / Engine / Context / Run / ModelRouter / ToolRegistry。  
本阶段 **不** 创建 ContentPlan、选题/脚本/视频 Agent，不接 SocialDataX / 抖音 / CDP。

---

## 1. Agent 定位

根据用户填写的账号基础信息，生成结构化账号定位方案，作为后续内容规划的输入。  
第一版只做：**用户输入 → ModelRouter → Schema 校验 → AgentRun**。

---

## 2. Input Schema

必填：`industry` `platform` `accountType` `goal`  
可选：`targetAudience` `expertise` `additionalInfo`

长度：100 / 50 / 100 / 500 / 500 / 1000 / 2000。  
禁止出现 `tenantId` / `workspaceId` / `projectId` / `userId`（来自 JWT 与已校验的 Project）。

---

## 3. Output Schema

`AccountPositioningOutput`：账号定位、目标用户、痛点、赛道、支柱、差异化、人设、简介、形式、发布策略、初始方向。  
必须是 JSON。禁止 Markdown 与额外文本。校验失败 → `AGENT_INVALID_OUTPUT`。

---

## 4. Prompt 版本

`apps/backend/src/agents/prompts/account-positioning.prompt.ts`  
键：`account.positioning:v1`（与 Agent id 对齐）。  
不写在 Controller / Service / Engine 内。

---

## 5. 模型调用

只调用 `ModelRouter.generate()`，可传 `model` `messages` `responseFormat` `temperature` `maxTokens`。  
Agent 不知道具体 Provider。

---

## 6. Provider

仓库内 **没有** Router One / OpenRouter / 厂商 SDK 配置，因此不猜测专有 API。

实现了一个 **OpenAI-compatible** `RealModelProvider`（`POST {MODEL_BASE_URL}/chat/completions`）。  
若日后使用 Router One，只要它兼容该协议，填同一组环境变量即可。

| 变量 | 用途 |
| --- | --- |
| `MODEL_API_KEY` | 密钥，禁止入库/写进代码/Prompt |
| `MODEL_BASE_URL` | 例如 `https://api.example.com/v1` |
| `MODEL_NAME` | 模型名 |

三缺一：`MODEL_PROVIDER_NOT_CONFIGURED`。  
`NODE_ENV=test` 或未配置时，默认 **Mock**，测试不依赖真实 LLM。

---

## 7. 执行流程

```
POST /agents/runs
  → Auth + agent:execute
  → 校验 projectId ∈ tenant + workspace
  → 校验 Input Schema
  → AgentRun PENDING → RUNNING
  → PromptRegistry + ModelRouter
  → JSON parse + Output Schema
  → COMPLETED / FAILED
```

timeout 60s。temperature 0.4、maxTokens 2500 写在 **Agent Definition**，不写死在 Engine。

---

## 8. AgentRun

复用现有 `agent_runs`。duration 由 `startedAt` / `completedAt` 计算，不新增列。  
Token：Provider 有 usage 则写入；没有则 null。Mock 可模拟。禁止伪造真实 token。

---

## 9. 错误处理

复用统一 `ErrorCode`，新增：

- `AGENT_INVALID_OUTPUT`
- `MODEL_PROVIDER_NOT_CONFIGURED`
- `MODEL_REQUEST_FAILED`
- `MODEL_TIMEOUT`

不把模型原文、密钥、堆栈返回 Frontend。

---

## 10. Tenant 隔离

`tenantId` 仅来自 JWT。`projectId` 必须属于当前空间。跨租户 / 不存在 404。无 `agent:execute` → 403 `AGENT_FORBIDDEN`。

---

## 11. Frontend

`/dashboard/agents/account-positioning`  
表单 + 分析中状态 + Card/List/Tag 展示结果 + 最近 Run（状态、耗时、版本、requestId、token）。  
不展示 Prompt / API Key / Internal Secret。

---

## 12. 测试

单元：Registry、Input/Output、Mock 结构化输出、非 JSON、Schema 失败、Provider 未配置、请求失败、timeout。  
e2e：发现、执行完成、缺字段、超长、租户/空间/项目隔离、权限、历史、不泄露 Token。  
真实模型：`AGENT_REAL_MODEL_TEST=true` 且三变量齐全才跑 integration，否则跳过。

---

## 13. 后续扩展

- 将本输出作为 ContentPlan / 选题 Agent 的输入（另开阶段）
- 真实 Router One 若非 OpenAI 协议，再单独加 Provider
- 配额与异步队列
