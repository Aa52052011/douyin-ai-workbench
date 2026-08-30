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

认证接口见 [auth-api.md](./auth-api.md)。需要有效的 `DATABASE_URL` 与 `JWT_ACCESS_SECRET`（见仓库根 `.env.example`）。

## AI Engine

需要 Python 3.11+（本机若未安装，仅保留源码骨架）。

```bash
cd apps/ai-engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Database

官方方式：Docker Compose 启动 PostgreSQL 16。

```bash
npm run db:up
copy database\.env.example database\.env
npm run db:generate
npm run db:migrate:deploy
npm run db:test
```

- 开发库：`postgresql://acf:acf@localhost:5432/acf_dev`
- 测试库：`postgresql://acf:acf@localhost:5432/acf_test`（`database/docker/init.sql` 创建）
- 不要提交 `database/.env` 或真实密码

本机若无 Docker：不要改成 SQLite。安装 Docker Desktop，或自行提供 PostgreSQL 16 并设置 `DATABASE_URL`。  
`npm run db:test` 在检测不到 5432 时会启动嵌入式 PostgreSQL 16（仅测试用）。

## Workers

尚未启动。不连接 Redis。
