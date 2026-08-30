# AI Content Factory

AI 抖音智能体工作台。当前版本：**V1.0 MVP 初始化**。

完整定位、范围与原则见 [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)。

## 仓库结构

```
apps/frontend     Next.js + TypeScript + TailwindCSS
apps/backend      NestJS + TypeScript
apps/ai-engine    Python + FastAPI
packages/         共享包（预留）
database/         Prisma / PostgreSQL（预留）
workers/          BullMQ 异步任务（预留）
docs/             架构与开发文档
```

## 启动

```bash
npm install
npm run dev:frontend
npm run dev:backend
```

AI Engine 与数据库、队列在后续阶段接入。详见 [docs/development.md](./docs/development.md)。

## 开发原则

- 一次只做一个模块
- 开发前先设计
- 开发后必须测试
