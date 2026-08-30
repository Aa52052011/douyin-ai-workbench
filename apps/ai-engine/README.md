# ai-engine

Python FastAPI AI 执行服务。本阶段只提供 **Agent 执行协议** 与 `system.echo`，不调用真实 LLM。

本机若未安装 Python：**不要强行安装**。源码、DTO 与本文档即可作为协议契约。Backend 在未配置 `AI_ENGINE_URL` 时使用进程内 Mock 执行同一协议。

## 接口

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/health` | 无 | 存活检查 |
| POST | `/internal/agent/execute` | `X-Internal-Secret` | 仅 `system.echo:v1` |

内部密钥来自环境变量 `AI_ENGINE_SECRET`，禁止写死。密钥未配置时内部接口拒绝全部请求。

## 请求

```json
{
  "requestId": "uuid",
  "agentId": "system.echo",
  "agentVersion": "v1",
  "context": {
    "userId": "...",
    "tenantId": "...",
    "workspaceId": "...",
    "projectId": "...",
    "requestId": "uuid",
    "locale": "zh-CN"
  },
  "input": { "message": "hello" }
}
```

## 响应

```json
{
  "status": "COMPLETED",
  "output": { "message": "hello", "agent": "system.echo", "version": "v1" },
  "usage": { "inputTokens": 8, "outputTokens": 2, "totalTokens": 10, "estimatedCost": 0 }
}
```

## 本地运行（已安装 Python 3.11+ 时）

```bash
cd apps/ai-engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set AI_ENGINE_SECRET=replace-me
uvicorn app.main:app --reload --port 8000
```

## 本阶段不做

真实 OpenAI / Anthropic / Gemini / DeepSeek / Qwen 调用、LangGraph、业务 Agent、Redis。
