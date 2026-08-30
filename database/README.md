# database

数据库与 Prisma 资源目录。

规划：

- `prisma/schema.prisma`：数据模型（所有业务表预留 `tenant_id`）
- `prisma/migrations/`：迁移文件

当前初始化阶段不创建 schema、不配置数据源、不连接 PostgreSQL。
