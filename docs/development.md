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

## AI Engine

需要 Python 3.11+（本机若未安装，仅保留源码骨架）。

```bash
cd apps/ai-engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Workers / Database

初始化阶段不启动。不连接 Redis，不连接 PostgreSQL。
