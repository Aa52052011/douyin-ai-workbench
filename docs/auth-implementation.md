# 认证实现说明（V1.0）

状态：已实现注册 / 登录 / 刷新 / 退出 / 当前用户。  
不包含 Agent、视频、多 Workspace UI。  
依据：[auth-architecture.md](./auth-architecture.md)、[auth-api.md](./auth-api.md)。

---

## 1. 注册流程

`POST /auth/register` 在 **一个 Prisma 事务** 中：

1. 规范化 email（trim + lowercase）
2. 拒绝已存在 email
3. Argon2id 哈希密码
4. `User.create`
5. `Tenant.create`（名称：`{name} 的工作台`，slug 由 email 派生）
6. `Workspace.create`（名称：`默认工作空间`，slug：`default`）
7. `Membership.create`（`role = OWNER`）
8. 签发 Access JWT，写入 Refresh Token **hash**，Set-Cookie

任一步失败则整单回滚。请求体不能带 `tenantId`（`forbidNonWhitelisted`）。

---

## 2. 登录流程

`POST /auth/login`：

1. 规范化 email
2. 查找用户；无论是否存在都走一次密码校验路径
3. 失败统一 `AUTH_INVALID_CREDENTIALS`（不区分用户是否存在）
4. 取该用户最早的 Membership + 该租户最早的未删除 Workspace（V1.0 默认上下文）
5. 签发 Access + 新 Refresh（只存 hash）

Tenant / Workspace **不**从请求参数读取。

---

## 3. Token 生命周期

| 令牌 | 存放 | 寿命 | 内容 |
| --- | --- | --- | --- |
| Access JWT | 响应 JSON；前端仅内存 | 默认 15 分钟 | `sub, tid, wid, role, jti, iss, exp` |
| Refresh | HttpOnly Cookie `acf_rt`；库中只存 SHA-256 | 默认 30 天 | 随机 32 字节，永不入库明文 |

Access 不入库。改密 / 退出通过撤销 refresh 立即切断续期。

---

## 4. Refresh Token 轮换

1. 读 Cookie（或桌面 body 备用字段）
2. 按 hash 查找
3. 已撤销 → 撤销该用户其余未撤销 refresh → `AUTH_REFRESH_REVOKED`
4. 过期 → 撤销本条 → `AUTH_REFRESH_INVALID`
5. 事务：撤销旧行 + 插入新 hash
6. 返回新 Access，Set-Cookie 新 Refresh

旧 refresh 不能再次使用。

---

## 5. Logout 机制

- `POST /auth/logout`：撤销当前 refresh，清 Cookie
- `POST /auth/logout-all`：需 Access；撤销该用户全部 refresh，清 Cookie

---

## 6. Tenant 上下文

来自 Access JWT 的 `tid`，由 **Guard** 写入 `request.auth`。  
后续 Controller 使用 `@CurrentUser()`。  
前端传入的 tenantId 一律忽略。

---

## 7. Workspace 上下文

V1.0 注册时创建唯一默认空间。`wid` 同样来自 JWT。  
不做切换 UI / 切换接口。

---

## 8. 密码安全

- 算法：**Argon2id**（`argon2`，Node 24 可用）
- 最少 8 位，**只在 Backend 强制**
- 禁止 MD5 / SHA1 / 裸 SHA256 / 明文
- 响应与 `/auth/me` 永不包含 `passwordHash`

---

## 9. Token 安全

**Web（当前）：** Refresh 只用 HttpOnly + SameSite=Lax Cookie；`Secure` 由 `COOKIE_SECURE=true` 打开（HTTPS）。Access 放内存，不进 localStorage。

**为什么不把 Refresh 放 localStorage：** XSS 可读 localStorage，长期令牌会被偷走并重放。

**未来 Tauri：** 自定义协议下 Cookie 不可靠。同一套 API 已允许 refresh 走 body（仅服务端校验 hash）。桌面应把 refresh 放 **OS 安全存储**，不要明文文件。V1.0 前端不使用 body 存 refresh。

跨端口：Next 将 `/api/*` 反代到 Backend，Cookie 落在 `localhost:3000`，同站发送。

---

## 10. 错误处理

统一：

```json
{ "code": "AUTH_INVALID_CREDENTIALS", "message": "Invalid email or password" }
```

不返回 Prisma / 堆栈。校验失败为 `VALIDATION_ERROR`。

---

## 11. 测试说明

`npm run test:e2e -w backend`（会按 database harness 启动 PostgreSQL 16）。

覆盖：注册事务与回滚、email 唯一与规范化、密码非明文、登录与用户枚举、Access 有效/过期、Refresh 轮换与重放、logout / logout-all、`/auth/me` 无 passwordHash、未登录 401、禁止请求带 tenantId。

---

## 12. V2 安全升级

- Redis：IP / 账号失败次数、验证码
- 启用 `COOKIE_SECURE` + 生产随机 `JWT_ACCESS_SECRET`
- Refresh 重放后按设备族撤销（已做用户级撤销）
- 邮箱验证、改密提升 `ver` claim
- PostgreSQL RLS
- 登录审计日志（仍禁止记录令牌明文）
