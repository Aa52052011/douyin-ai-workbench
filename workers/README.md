# workers

耗时 Job 的独立进程。PostgreSQL `Job` 是事实来源；Redis / BullMQ 只负责投递。

```bash
npm run db:up
npm run build -w backend
npm run start -w workers
```

开发：

```bash
npm run dev:worker
```

需要 `DATABASE_URL` 与 `REDIS_URL`。Queue 名：`acf-jobs`。payload 只有 `{ jobId }`。
