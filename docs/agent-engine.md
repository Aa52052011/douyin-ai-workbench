# Agent Engine

状态：基础设施已落地。测试 Agent：`system.echo:v1`。业务 Agent：`account.positioning:v1`（见 [account-positioning-agent.md](./account-positioning-agent.md)）。

依据：[architecture.md](./architecture.md)、[auth-architecture.md](./auth-architecture.md)、[database-architecture.md](./database-architecture.md)。

---

## 1. Agent Engine 架构

```
Frontend /dashboard/agents
        │
        ▼
Backend API  ── Auth / Authorization / tenant 上下文
        │
        ▼
Agent Engine
  ├── AgentRegistry     代码注册 Definition
  ├── AgentContext      精简执行上下文
  ├── AgentRun          PostgreSQL 执行记录
  ├── ModelRouter       模型抽象（V1 = Mock）
  ├── ToolRegistry      工具抽象（V1 = echoTool）
  └── PromptRegistry    版本化 Prompt
        │
        ▼
Executor
  ├── InProcess（默认，无 Python / 未配 AI_ENGINE_URL）
  └── AI Engine HTTP（配置了 AI_ENGINE_URL）
```

Backend 负责：API、认证、权限、租户/空间/项目校验、Run 持久化。  
AI Engine 负责：同一套内部执行协议。本机无 Python 时不强制安装，Backend 用进程内 Mock 跑通链路。

---

## 2. Agent Definition

`AgentDefinition` 是软件能力，不是业务数据。

| 字段 | 说明 |
| --- | --- |
| id | 如 `system.echo` |
| name | 展示名 |
| version | 如 `v1`，必须版本化 |
| description | 用途 |
| capabilities | 能力标签 |
| inputSchema / outputSchema | JSON Schema |
| timeoutMs | 默认 60000 |

未来业务 id（本阶段 **不注册**）：`account-positioning`、`content-planning`、`script-generation`、`video-production`、`analytics`。

**V1 结论：Definition = 代码注册，不建 `AgentDefinition` 表。**

原因：Agent 随发版演进；表存储会造成「库里有定义、代码里没有实现」的漂移。运行记录才需要入库。

---

## 3. Agent Registry

`apps/backend/src/agents/agent.registry.ts` 启动时注册 `system.echo:v1`。

- `list()`：发现
- `get(id, version?)`：按版本查找；省略 version 时取已注册版本
- 未知 id / 版本 → `AGENT_NOT_FOUND`

---

## 4. Agent Context

```ts
{
  userId, tenantId, workspaceId, projectId, requestId, locale
}
```

来自 JWT + 已校验的 `projectId` + `X-Request-Id` / 生成的 requestId。  
禁止塞入完整 User、密码、Access / Refresh Token。  
预留扩展：subscription、usage、permissions、memory。

---

## 5. Agent Run

表 `agent_runs`。一次执行一行。`input` / `output` / `error` 使用 JSONB。

状态：`PENDING` → `RUNNING` → `COMPLETED` | `FAILED` | `CANCELLED`。

隔离：`tenantId` 只来自认证上下文；`workspaceId` 来自当前 JWT 空间；`projectId` 必须属于该 `tenantId + workspaceId`。客户端不能指定 `tenantId`。

预留：`inputTokens` / `outputTokens` / `totalTokens` / `estimatedCost`。

---

## 6. ModelRouter

Agent **不得**直接写 OpenAI / Anthropic / Google / DeepSeek / Qwen SDK。

只调用 `ModelRouter.generate()`。实现：`MockModelProvider` + OpenAI-compatible `RealModelProvider`。  
测试环境默认 Mock。未配置 `MODEL_*` 时不调用真实 LLM。本阶段不计费。

---

## 7. ToolRegistry

Agent 通过 `ToolRegistry.invoke(name, input, context)` 调工具。  
V1 只注册 `echoTool`。未来工具（`searchSocialData`、`generateVideo` 等）在此挂载，Agent 不依赖具体 SDK。

---

## 8. PromptTemplate

```ts
{ name, version, systemPrompt, userPromptTemplate }
```

键：`name:version`，例如 `system.echo:v1`。  
本阶段不为业务写 Prompt，但接口已版本化。

---

## 9. 同步执行

`POST /agents/runs` → `AgentEngine.execute()`：

1. Auth + `agent:execute`
2. 校验 Project
3. 解析 Definition / Input
4. 创建 `PENDING` Run，转入 `RUNNING`
5. 构建 Context，带 `requestId`
6. Executor（ModelRouter / ToolRegistry）
7. 更新 Run，返回结果

默认超时 60 秒。本阶段一次执行，不重试；错误已分类为 retryable / non-retryable，供未来 retry 使用。

---

## 10. 异步扩展

`AgentEngine.enqueue()` 已预留，当前抛 `AGENT_ASYNC_NOT_IMPLEMENTED`。  
**不要**在本阶段接入 Redis / BullMQ。V2 再把同一 `InternalAgentRequest` 投入队列。

---

## 11. AI Engine

`apps/ai-engine/`：

```
app/
  main.py
  agents/
  models/
  tools/
  schemas/
  core/
```

- `GET /health`
- `POST /internal/agent/execute`：只允许 `system.echo`

无 Python 运行环境时保留源码与协议即可。

---

## 12. Internal API

比较：

| 方式 | V1 |
| --- | --- |
| API Key / Internal Secret | **采用**：`AI_ENGINE_SECRET` + 头 `X-Internal-Secret` |
| mTLS | V2/生产再考虑 |

密钥只来自环境变量，禁止写死。AI Engine **不是**公开用户 API，不做用户 JWT。  
信封：`requestId, agentId, agentVersion, context, input`。  
返回：`status, output, usage`（失败带 `error.code`，不回传模型原始错误）。

---

## 13. 错误处理

| 码 | 含义 | 默认可重试 |
| --- | --- | --- |
| AGENT_NOT_FOUND | 未注册 | 否 |
| AGENT_INVALID_INPUT | 入参不合 schema | 否 |
| AGENT_EXECUTION_FAILED | 执行失败 | 是（网络类） |
| AGENT_TIMEOUT | 超时 | 是 |
| MODEL_ERROR | 模型层 | 视原因 |
| TOOL_ERROR | 工具层 | 否 |
| AGENT_CANCELLED | 取消 | 否 |
| AGENT_FORBIDDEN | 无 `agent:execute` | 否 |
| AGENT_RUN_NOT_FOUND | 跨租户/不存在的 Run | 否 |
| AGENT_ASYNC_NOT_IMPLEMENTED | enqueue 未开放 | 否 |

禁止把第三方模型原文、密钥、堆栈返回给 Frontend。

---

## 14. 日志

Run / 日志记录：`requestId`、agent、version、status、duration、errorCode。  
可记：Prompt **hash**、长度、token usage。  

**默认不记录完整 Prompt 与完整模型响应。**

| 环境 | 策略 |
| --- | --- |
| 生产 | 禁止完整 Prompt；避免用户内容与业务秘密进入日志系统 |
| 开发 | 仍默认摘要；需要排错时设 `AGENT_DEBUG_PROMPTS=true` |

永不记录：密码、Access Token、Refresh Token、完整 Cookie、敏感用户字段。

---

## 15. Token Usage

`AgentRun` 预留 token 与 `estimatedCost`。Mock 模型写入模拟值。接真实模型时走同一字段。本阶段不计费、不限额。

---

## 16. 多租户隔离

- `tenantId` 只来自 JWT
- `workspaceId` 只来自当前上下文（V1 = JWT workspace）
- `projectId`：`findFirst({ id, tenantId, workspaceId, deletedAt: null })`
- 读 Run 同样带 `tenantId + workspaceId`
- 跨租户对外 404（`AGENT_RUN_NOT_FOUND` / `PROJECT_NOT_FOUND`）
- DTO `forbidNonWhitelisted`：客户端传 `tenantId` 直接 `VALIDATION_ERROR`

---

## 17. V2 扩展

- `enqueue()` + Redis / BullMQ
- 按 Agent 不同 timeout / retry 队列
- 更多 ModelProvider（仍经 ModelRouter）
- 其余业务 Agent（选题 / 脚本 / 视频 / 分析）
- human-in-the-loop
- Tenant / Subscription 路由与配额
- AI Engine mTLS
- 取消（`CANCELLED`）与 Run 列表分页

**不要在引擎层绑定某一家模型或某一个业务 Agent。**
