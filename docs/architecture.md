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
- **ai-engine**：全部 AI 能力的唯一执行入口，由 Agent 管理。用户认证不在此层。内部调用使用 `AI_ENGINE_SECRET`。详见 [agent-engine.md](./agent-engine.md)。
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

已完成：用户认证（注册 / 登录 / 刷新 / 退出 / 当前用户）。详见 [auth-implementation.md](./auth-implementation.md)。

已完成：Workspace / Project 基础管理。详见 [workspace-project.md](./workspace-project.md)。

已完成：Agent Engine 基础设施（Definition 代码注册、AgentRun 入库、Mock Model/Tool、`system.echo`、Internal 协议）。详见 [agent-engine.md](./agent-engine.md)。

已完成：第一个业务 Agent `account.positioning:v1`（结构化输出 + OpenAI-compatible RealModelProvider 骨架）。详见 [account-positioning-agent.md](./account-positioning-agent.md)。

已完成：`content.planning:v1` 与 ContentPlan 版本化业务对象（JSONB Topic、positioningSnapshot、DRAFT → CONFIRMED → ARCHIVED）。详见 [content-planning-agent.md](./content-planning-agent.md)。

已完成：`script.generation:v1` 与 Script 版本化（Topic JSONB、payload、topicSnapshot、DRAFT → CONFIRMED → ARCHIVED）。详见 [script-generation-agent.md](./script-generation-agent.md)。

已完成：Asset / AssetLink / Job / Video 扩展、LocalStorage、Mock 成片。详见 [media-asset-implementation.md](./media-asset-implementation.md)。

已完成：Redis + BullMQ + Worker 异步 Job。详见 [job-queue-worker.md](./job-queue-worker.md)。

已完成：视频生产链（ProductionPlan + Visual/Voice/Subtitle/Compose Mock Stage + Job lease / heartbeat / crash recovery）。详见 [video-generation-pipeline-implementation.md](./video-generation-pipeline-implementation.md)。

已完成：Finalize 短事务（Asset / VIDEO_OUTPUT / Video / Job 同提交，幂等）。详见 [video-finalization-consistency-implementation.md](./video-finalization-consistency-implementation.md)。

已完成：可选本机 FFmpeg Compose（Mock TTS WAV + 色板 + SRT → 可播放 MP4）。详见 [ffmpeg-compose-implementation.md](./ffmpeg-compose-implementation.md)。

已完成：可选 OpenAI-compatible 同步 TTS（`MEDIA_TTS_PROVIDER=openai-tts`，测试默认 Mock）。详见 [openai-compatible-tts-implementation.md](./openai-compatible-tts-implementation.md)。

已完成：可选 MiniMax 同步 TTS（`MEDIA_TTS_PROVIDER=minimax-tts`，测试默认 Mock）。详见 [minimax-tts-implementation.md](./minimax-tts-implementation.md)。

已完成：Publishing Provider 合同、Mock API 发布闭环，以及 Manual Export + Manual Publication。详见 [publishing-foundation.md](./publishing-foundation.md)。**未**接真实 Douyin API。

已完成：Publication 级 Post Metrics 地基、Manual Metrics API、MOCK metrics sync、deterministic Aggregator、deterministic Performance Insight、compact feedback 注入 content.planning:v1。详见 [publication-metrics.md](./publication-metrics.md) 与 [content-planning-agent.md](./content-planning-agent.md)。**未**实现真实平台拉取 / scheduler / 自动 feedback loop。

未做：ProviderRouter / 自动 fallback、对象存储、SocialDataX、**真实社媒发布 API**、完整日历 UI、Topic 表、影视剪辑实现。
