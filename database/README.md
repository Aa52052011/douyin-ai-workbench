# database

Prisma + PostgreSQL。模型唯一来源：`prisma/schema.prisma`。

本目录只放结构、migration 与客户端，不放认证或业务规则。

## 启动

```bash
docker compose up -d postgres
copy database\.env.example database\.env
npm run db:generate
npm run db:migrate:deploy
npm run db:test
```

默认连接（仅本地示例，非生产密钥）：

`postgresql://acf:acf@localhost:5432/acf_dev?schema=public`

架构说明见 [docs/database-architecture.md](../docs/database-architecture.md)。
