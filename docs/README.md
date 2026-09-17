# docs

项目文档目录。

| 文档 | 说明 |
| --- | --- |
| [architecture.md](./architecture.md) | 当前 monorepo 架构与边界 |
| [auth-architecture.md](./auth-architecture.md) | 用户系统与多租户架构（设计，未实现） |
| [database-architecture.md](./database-architecture.md) | Prisma / PostgreSQL 模型、索引与删除策略 |
| [auth-implementation.md](./auth-implementation.md) | V1.0 认证实现与安全说明 |
| [auth-api.md](./auth-api.md) | 认证 HTTP 契约 |
| [workspace-project.md](./workspace-project.md) | Workspace / Project 与租户隔离 |
| [agent-engine.md](./agent-engine.md) | Agent Engine 基础设施与 system.echo |
| [account-positioning-agent.md](./account-positioning-agent.md) | 账号定位 Agent |
| [content-planning-agent.md](./content-planning-agent.md) | 内容规划 Agent 与 ContentPlan（已实现） |
| [content-planning-agent-design.md](./content-planning-agent-design.md) | 内容规划 Agent 设计原稿 |
| [script-generation-agent.md](./script-generation-agent.md) | 脚本生成 Agent 与 Script（已实现） |
| [script-generation-agent-design.md](./script-generation-agent-design.md) | 脚本生成 Agent 设计原稿 |
| [media-asset-architecture.md](./media-asset-architecture.md) | Media / Asset 与 Video Generation 架构（仅设计，未实现） |
| [video-asset-implementation-design.md](./video-asset-implementation-design.md) | Asset / Video / Job 实现前设计 |
| [media-asset-implementation.md](./media-asset-implementation.md) | Asset / Job / Video V1 实现说明 |
| [job-queue-worker.md](./job-queue-worker.md) | Redis / BullMQ / Worker |
| [video-generation-pipeline-design.md](./video-generation-pipeline-design.md) | Script → 成片生产链设计 |
| [video-generation-pipeline-implementation.md](./video-generation-pipeline-implementation.md) | ProductionPlan / Stages / Lease 实现（Mock） |
| [real-media-provider-readiness-design.md](./real-media-provider-readiness-design.md) | 真实 Provider 接入前：Finalize / 幂等 / 异步 / 风险 |
| [video-finalization-consistency-implementation.md](./video-finalization-consistency-implementation.md) | Finalize 短事务与幂等（Step 6.4） |
| [ffmpeg-compose-implementation.md](./ffmpeg-compose-implementation.md) | 本机 FFmpeg 可播放 MP4（Step 6.5，可选） |
| [real-tts-provider-design.md](./real-tts-provider-design.md) | 真实 TTS 选型与接入设计（Step 6.6） |
| [openai-compatible-tts-implementation.md](./openai-compatible-tts-implementation.md) | 第一家同步 TTS：openai-tts（Step 6.7） |
| [minimax-tts-implementation.md](./minimax-tts-implementation.md) | MiniMax 同步 TTS：minimax-tts（Step 6.7-M） |
| [real-visual-provider-design.md](./real-visual-provider-design.md) | 真实 Visual Provider 架构（Step 7.1，仅设计） |
| [publishing-foundation.md](./publishing-foundation.md) | Publishing 基础：Publication / SecretStore / Job 分发（Step 8.2） |
| [douyin-oauth.md](./douyin-oauth.md) | Douyin OAuth 账号连接（Step 8.6） |
| [publication-metrics.md](./publication-metrics.md) | Publication Metrics：Manual + MOCK sync + Aggregator + Insight + Planning feedback（Step 9.2–9.8） |
| [development.md](./development.md) | 本地启动说明 |

业务模块在对应设计文档评审通过后再实现。

UI/UX 蓝图（2026-09-16，**确认前禁止大规模改页面**）：

| 文档 | 说明 |
| --- | --- |
| [ui-ux/product-redesign-spec.md](./ui-ux/product-redesign-spec.md) | 总纲与冻结边界 |
| [ui-ux/information-architecture.md](./ui-ux/information-architecture.md) | 导航与 App Shell |
| [ui-ux/page-flow-map.md](./ui-ux/page-flow-map.md) | 页面任务与 CTA |
| [ui-ux/design-system-v2.md](./ui-ux/design-system-v2.md) | 视觉与 a11y 规范 |
| [ui-ux/component-map-v2.md](./ui-ux/component-map-v2.md) | 组件复用 |
| [ui-ux/status-language-map.md](./ui-ux/status-language-map.md) | 状态人话映射 |
| [ui-ux/known-ux-issues.md](./ui-ux/known-ux-issues.md) | 问题总账与 limitations |
| [ui-ux/implementation-waves.md](./ui-ux/implementation-waves.md) | Phase A–I |
