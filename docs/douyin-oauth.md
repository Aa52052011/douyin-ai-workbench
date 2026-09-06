# Douyin OAuth Architecture（Step 8.6）

状态：**账号授权架构已落地。OAuth 已连接 ≠ 已开通 Douyin 发布能力，也 ≠ 已开通 metrics 能力。**

Douyin API 发布仍由 Registry fail closed：`PUBLISHING_PROVIDER_NOT_IMPLEMENTED`。本步骤不实现 `create_video` / upload / 状态轮询。

依据：[publishing-foundation.md](./publishing-foundation.md)、[architecture.md](./architecture.md)。

---

## Authorization Code Flow

```
Browser
  → POST /platform-accounts/douyin/connect  (JWT + platform_account:manage)
  → Backend 生成随机 state，写入 OAuthStateStore
  → 返回 { authorizationUrl }
  → 用户在抖音官方授权页确认
  → GET /platform-accounts/douyin/callback?code&state
  → Backend 校验并一次性消费 state
  → DouyinOAuthClient.exchangeCode（仅服务端）
  → DouyinOAuthClient.getUserInfo（user_info）
  → SecretStore.put 加密 access/refresh token
  → upsert PlatformAccount（externalAccountId = open_id）
  → 返回简单 HTML：Douyin account connected. You may close this window.
```

禁止：password / cookie / session 抓取、扫码自动化、把 `code` 交给 frontend 换 token、把 token 放进 callback query。

最小 scope：**`user_info`**。不请求 `video.create.bind`。least privilege。未来 Step 8.7 真实发布能力通过后再增加。

---

## APIs

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/platform-accounts/douyin/connect` | JWT + `PLATFORM_ACCOUNT_MANAGE` | 返回 `{ authorizationUrl }`。URL 含 `client_key` `response_type=code` `scope=user_info` `redirect_uri` `state`。不含 `client_secret` |
| GET | `/platform-accounts/douyin/callback` | 无 JWT（靠一次性 state） | 服务端换 token。成功返回 HTML，失败 JSON 业务错误。禁止 token |
| GET | `/platform-accounts` | JWT | 当前 workspace 账号列表 |
| GET | `/platform-accounts/:id` | JWT | 详情。跨租户 / 跨 workspace → `PLATFORM_ACCOUNT_NOT_FOUND` |
| POST | `/platform-accounts/:id/refresh` | JWT + `PLATFORM_ACCOUNT_MANAGE` | 按需 refresh。无 scheduler |
| DELETE | `/platform-accounts/:id` | JWT + `PLATFORM_ACCOUNT_MANAGE` | `status=DISCONNECTED` + `SecretStore.revoke`。不物理删除，不影响历史 Publication |

公开账号字段：`id` `platform` `externalAccountId` `displayName` `status` `scopes` `connectedAt` `expiresAt` `lastRefreshedAt` `metadata`（仅 `avatarUrl`）。

禁止返回：`credentialRef`、cipher/nonce/authTag、accessToken、refreshToken、`DOUYIN_CLIENT_SECRET`。

---

## OAuth state / CSRF

- 实现：`OAuthStateStore`
- 测试：进程内 `InMemoryOAuthStateStore`（与 Job 队列相同：`NODE_ENV=test` 且未设 `RUN_REDIS_TESTS`）
- 生产：Redis key `oauth:douyin:{sha256(state)}`，TTL **10 分钟**
- 无 `REDIS_URL` 的生产进程：fail closed `OAUTH_STATE_STORE_UNAVAILABLE`
- **没有** OAuthState 数据库表，无 migration

state 绑定：`tenantId` `workspaceId` `userId` `platform=DOUYIN` `requestedScopes` `createdAt` `expiresAt`。

禁止把 `clientSecret` / token / `credentialRef` 编进 state。state 不是 `tenantId`。

消费：原子 GET + DELETE（Redis Lua；内存 Map 同步 delete）。单次使用。并发同一 state 只有一次成功。过期或错误 state 拒绝。

---

## SecretStore ownership

复用 Step 8.2 `EncryptedDbSecretStore`。用户 OAuth credential：

- `accessToken`
- `refreshToken`
- `expiresAt`（access token **绝对时间** ISO）
- `refreshExpiresAt`
- `scopes`

`PlatformAccount.credentialRef` 只存 secret id。

`PlatformAccount.expiresAt` 语义：**access token 到期时间**（账号凭据健康的主时钟）。refresh 到期后账号标为 `EXPIRED`，需要重新 connect。

旋转顺序（重连 / refresh）：

1. `SecretStore.put` 新密文
2. 事务/更新 `PlatformAccount.credentialRef`
3. `SecretStore.revoke` 旧 secret

禁止先 revoke 旧 secret。新 put 之后若账号更新失败，会 revoke 刚写入的新 secret，避免账号指向不存在的凭据。

---

## Token lifecycle

| 动作 | 行为 |
| --- | --- |
| 首次 connect | 创建 `PlatformAccount` `ACTIVE`，`externalAccountId = open_id` |
| 同一 workspace 再授权同一 `open_id` | upsert 同一行，换新 credential |
| 跨 workspace 同一 `open_id` | 允许各连一次；secret 按 workspace 隔离 |
| `ensureValidCredential` | access 剩余小于 5 分钟 safety window 才 refresh。无 scheduler |
| refresh token 本地已过期，或 provider 判定授权失效 | `status=EXPIRED`，`PLATFORM_REAUTH_REQUIRED`。禁止自动死循环 retry |
| disconnect | `DISCONNECTED` + revoke。历史 Publication 不动 |

`DouyinOAuthClient` **不是** `PublishingProvider`。OAuth 与发布职责分离。

---

## 本地 / Desktop HTTPS callback 约束

官方 OAuth redirect 需要已登记的 **HTTPS** URI。

不要假设 `http://127.0.0.1` 能作为正式 redirect。

未来路线：

- 生产：Cloud HTTPS callback → 安全关联 PlatformAccount → Web/Desktop 轮询账号状态
- 未来 Tauri：系统浏览器打开官方授权页 → 云 callback → 桌面轮询。禁止 WebView 偷 token / 拦 Cookie

本步骤 callback UX：简单 HTML。不实现 Tauri，不实现正式 Connect UI。

---

## 配置

| 变量 | 用途 |
| --- | --- |
| `DOUYIN_CLIENT_KEY` | 开放平台应用 key |
| `DOUYIN_CLIENT_SECRET` | 仅 env / secure config。禁止入库、禁止 API、禁止日志、禁止贴到聊天 |
| `DOUYIN_REDIRECT_URI` | 必须与开放平台登记值完全一致 |
| `DOUYIN_OAUTH_BASE_URL` | 默认 `https://open.douyin.com` |
| `DOUYIN_API_BASE_URL` | 默认 `https://open.douyin.com` |

测试可注入 mock/local endpoint。默认测试套件 **0 次真实 Douyin 调用**（`MockDouyinOAuthClient`）。

真实 OAuth 验证是 **Step 8.6R**：操作者自己写 `.env`，明确批准后再进行。不要把 `CLIENT_SECRET` 发给助手。

---

## 与发布的关系

- `OAuth connected` ≠ Douyin publish enabled
- `POST` API Publication `platform=DOUYIN` 仍然 `PUBLISHING_PROVIDER_NOT_IMPLEMENTED`
- `DOUYIN` + `MANUAL` 不受影响：无账号也可导出并手工登记
