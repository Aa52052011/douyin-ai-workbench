# 架构说明（初始化）

## 系统分层

```
Desktop (Tauri, 后续)
        │
        ▼
   frontend (Next.js)
        │
        ▼
   backend (NestJS) ──► workers (BullMQ / Redis)
        │
        ▼
   ai-engine (FastAPI / LangGraph)
```

- **frontend**：工作台 UI。V1.0 先以 Web 运行，后续由 Tauri 封装桌面端。
- **backend**：业务 API、鉴权、任务投递。不直接跑模型推理。
- **ai-engine**：全部 AI 能力的唯一执行入口，由 Agent 管理。
- **workers**：耗时任务（视频生成、分析等）异步消费。
- **database**：PostgreSQL + Prisma。隔离根是 **Tenant**（`tenant_id`），不是 User。Workspace 及其下资源另有 `workspace_id`。User 表不挂 `tenant_id`。模型唯一来源：`database/prisma/schema.prisma`。详见 [auth-architecture.md](./auth-architecture.md)、[database-architecture.md](./database-architecture.md)。

## Monorepo 约定

| 目录 | 职责 |
| --- | --- |
| `apps/frontend` | Next.js 桌面/Web 前端 |
| `apps/backend` | NestJS API |
| `apps/ai-engine` | FastAPI AI 服务 |
| `packages/` | 共享 TS 包（尚未创建） |
| `database/` | Prisma schema 与迁移 |
| `workers/` | BullMQ 处理器 |
| `docs/` | 设计与开发文档 |

## 多租户与认证（设计，未实现）

完整条文：[auth-architecture.md](./auth-architecture.md)。

- 模型：**User → Tenant → Workspace**（方案 B）。V1.0 注册后静默 1:1:1，UI 不暴露租户。
- Tenant：计费与数据隔离根。Workspace：项目 / Agent / 内容容器。
- 认证：邮箱 + 密码；**JWT Access + 可撤销 Refresh Token**（兼顾 Next.js 与未来 Tauri）。
- 权限：Tenant 级 Owner / Admin / Member；V1.0 仅 Owner。
- 隔离：业务查询必须带服务端 `tenant_id`；跨租户对外 404。RLS 原则已定，V2 再启用。
- 边界：Frontend 只调 Backend；AI Engine 不做用户认证；Worker 不得改 Membership 或签发令牌。

## 本阶段边界

已完成：目录与可运行骨架；用户/多租户架构设计；Prisma 核心 schema 与 `init_core_schema` migration。

未做：认证实现、Agent、前端业务页、外部 API、队列消费。
