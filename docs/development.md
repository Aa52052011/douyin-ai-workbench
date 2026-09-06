# 本地开发

根目录使用 npm workspaces 管理 Node 包。需要 Node.js 20+。

## 前端

```bash
npm install
npm run dev:frontend
```

默认地址：`http://localhost:3000`

## 后端

```bash
npm run dev:backend
```

默认地址：`http://localhost:3001`

认证接口见 [auth-api.md](./auth-api.md)。Workspace / Project 见 [workspace-project.md](./workspace-project.md)。Agent Engine 见 [agent-engine.md](./agent-engine.md)。账号定位见 [account-positioning-agent.md](./account-positioning-agent.md)。内容规划见 [content-planning-agent.md](./content-planning-agent.md)。需要有效的 `DATABASE_URL` 与 `JWT_ACCESS_SECRET`（见仓库根 `.env.example`）。

未配置 `AI_ENGINE_URL` 时，Backend 进程内执行 Agent（Mock 或本地 RealModelProvider）。Agent 不使用 Redis。视频 Job 使用 Redis + Worker。

真实模型需同时配置 `MODEL_API_KEY`、`MODEL_BASE_URL`、`MODEL_NAME`（OpenAI-compatible）。未配置时账号定位与内容规划走 Mock，测试不会失败。`NODE_ENV=test` 必须走 Mock。仓库当前 **没有** 内置 Router One 地址。

内容规划最小页：`/dashboard/content-planning`。V1 只开放 7 天 × 每天 1-5 条。  
脚本最小页：`/dashboard/scripts`、`/dashboard/scripts/[id]`。只从 CONFIRMED / ARCHIVED 规划的 Topic 生成，时长 15/30/45/60 秒。DRAFT 规划返回 `CONTENT_PLAN_CONFLICT`。详见 [script-generation-agent.md](./script-generation-agent.md)。  
素材 / 成片：`/dashboard/assets`、`/dashboard/videos`。默认 Mock Compose 与 Mock TTS。本机已安装 `ffmpeg`/`ffprobe` 且 Worker 配置 `MEDIA_COMPOSE_PROVIDER=ffmpeg` 时，可生成可播放 MP4。配音默认 Mock；`MEDIA_TTS_PROVIDER=openai-tts` 或 `minimax-tts` 且对应独立 TTS 配置齐全时走真实同步 TTS。`NODE_ENV=test` 默认仍走 Mock。真实 TTS 测试必须 `RUN_REAL_TTS_TESTS=true`（会产生费用）。MiniMax 还需要 `MEDIA_TTS_PROVIDER=minimax-tts` 与 `MINIMAX_TTS_VOICE`。不要把 Key 或 FFmpeg 绝对路径提交进仓库。详见 [ffmpeg-compose-implementation.md](./ffmpeg-compose-implementation.md)、[openai-compatible-tts-implementation.md](./openai-compatible-tts-implementation.md)、[minimax-tts-implementation.md](./minimax-tts-implementation.md)。

## AI Engine

需要 Python 3.11+（本机若未安装，仅保留源码与协议，**不要强行安装 Python**）。

```bash
cd apps/ai-engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Database

官方方式（Docker 可用时）：Compose 启动 PostgreSQL 16，端口 **5432**，库 `acf_dev`。

```bash
npm run db:up
copy database\.env.example database\.env
npm run db:generate
npm run db:migrate:deploy
```

当前 Windows 10 21H1 无法安装 Docker Desktop 时，使用仓库内 PostgreSQL 16.14 二进制建立**持久**本地开发库：

```bash
npm run db:local:init
npm run db:local:start
npm run db:migrate:deploy
```

- 开发库（Windows local）：host `127.0.0.1`，port `55432`，database `acf_dev`，user `acf`，schema `public`
- 开发库（Docker Compose）：host `localhost`，port `5432`，database `acf_dev`，user `acf`，schema `public`
- 测试库：`acf_test`，由 `database/test/harness.ts` 管理。Docker 可达时用 5432；否则用临时 embedded Postgres（默认从 55432 起选空闲端口）。**不要**把 `acf_test` 当开发库。
- `db:up` 仍只表示 Docker Compose。Windows 本地 cluster 用 `db:local:*`。
- 不要提交 `database/.env`、根 `.env`、`.local/postgres/data` 或真实密码

本机若无 Docker：不要改成 SQLite。使用 `npm run db:local:start`，或自行提供 PostgreSQL 16 并设置 `DATABASE_URL`。  
`npm run db:test` 在检测不到 5432 时会启动**临时**嵌入式 PostgreSQL 16 跑约束测试，测试结束即停。这不是开发库。

## Redis / Workers

```bash
npm run db:up
npm run dev:worker
```

`docker compose up -d` 会启动 PostgreSQL 16 与 Redis 7。`REDIS_URL=redis://127.0.0.1:6379`。不要提交 Redis 密码。

`NODE_ENV=test` 默认走内存队列，不需要 Redis。真实队列测试：`RUN_REDIS_TESTS=true`。Douyin OAuth state 同样：测试走内存 store；生产用 Redis TTL。账号授权见 [douyin-oauth.md](./douyin-oauth.md)。
