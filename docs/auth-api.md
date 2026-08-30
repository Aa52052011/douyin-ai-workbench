# Auth API

Base：`http://localhost:3001`（前端经 `/api` 反代）。

认证：受保护接口使用 `Authorization: Bearer <accessToken>`。  
Refresh：浏览器带 Cookie `acf_rt`（HttpOnly）。

## POST /auth/register

请求：

```json
{ "email": "ada@example.com", "password": "password1", "name": "Ada" }
```

成功 `201`：`user, tenant, workspace, role, accessToken, expiresIn`  
不返回 passwordHash / refresh 明文。

错误：`VALIDATION_ERROR` `400`，`AUTH_EMAIL_EXISTS` `409`

## POST /auth/login

请求：`{ "email", "password" }`  
成功同注册。  
错误：`AUTH_INVALID_CREDENTIALS` `401`（用户不存在与密码错误同一文案）

## POST /auth/refresh

Cookie 或 body `{ "refreshToken" }`（桌面备用）。  
成功：新 access + 新 refresh Cookie。  
错误：`AUTH_REFRESH_INVALID` / `AUTH_REFRESH_REVOKED`

## POST /auth/logout

撤销当前 refresh，清除 Cookie。

## POST /auth/logout-all

需要 Bearer。撤销该用户全部 refresh。

## GET /auth/me

需要 Bearer。返回 `user, tenant, workspace, role`。无 passwordHash。

未登录：`AUTH_UNAUTHORIZED` `401`  
Access 过期：`AUTH_TOKEN_EXPIRED` `401`
