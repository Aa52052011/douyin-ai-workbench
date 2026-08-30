# Workspace 与 Project（V1.0）

状态：已实现基础 CRUD。不含 Agent、视频、Workspace 切换 UI。

---

## 1. Workspace 设计

Workspace 是 Tenant 下的协作容器。注册时自动创建 slug=`default` 的「默认工作空间」。

- 列表 / 详情：当前 JWT `tenantId` 内、未软删
- 创建 / 改名 / 删除：权限 `workspace:*`（V1.0 仅 OWNER）
- `tenantId` 只来自认证上下文，请求体禁止携带

## 2. Project 设计

Project 是内容生产项目，同时带 `tenantId` + `workspaceId`。

- 列表 / 详情 / 写操作均带当前租户 + 当前工作空间条件
- 客户端不能指定 `tenantId` / `workspaceId`
- 未增加 `status`：归档用 `deletedAt`，避免与软删重叠

## 3. Tenant 隔离

| 资源 | 查询必带 |
| --- | --- |
| Workspace | `id` + `tenantId` + `deletedAt: null` |
| Project | `id` + `tenantId` + `workspaceId` + `deletedAt: null` |

跨租户一律 **404**（`WORKSPACE_NOT_FOUND` / `PROJECT_NOT_FOUND`），不返回 403，避免探测资源是否存在。

禁止 `findUnique({ where: { id } })` 再事后比 tenant。

## 4. 权限

统一 `PermissionsGuard` + `@RequirePermission`，不在 Controller 写 `if (role === 'OWNER')`。

| 权限 | OWNER | ADMIN | MEMBER | EDITOR | VIEWER |
| --- | --- | --- | --- | --- | --- |
| workspace:create/update/delete | 是 | 部分 | 否 | 否 | 否 |
| project:create/update/delete | 是 | 是 | 否 | create/update | 否 |
| 只读 GET | 已登录即可 | 已登录即可 | 已登录即可 | 已登录即可 | 已登录即可 |

V1.0 实际只有 OWNER。矩阵已为未来角色预留。

## 5. API

- `GET/POST /workspaces`，`GET/PATCH/DELETE /workspaces/:id`
- `GET/POST /projects`，`GET/PATCH/DELETE /projects/:id`

创建 Workspace 请求：`{ "name" }`  
创建 Project 请求：`{ "name", "industry?", "platform?", "description?" }`

## 6. 删除策略

- Workspace / Project：**软删除** `deletedAt`
- 默认 Workspace（`slug=default`）不可删
- Workspace 下仍有未软删 Project → `WORKSPACE_NOT_EMPTY`
- Project 软删不 CASCADE ContentPlan / Script / Video

## 7. 当前 Workspace

来自 Access JWT 的 `wid`，`/auth/me` 已返回。  
`resolveWorkspaceId()` 现只读 JWT。已预留 `X-Workspace-Id` 形参，V1 **不切换**。

## 8. 未来多 Workspace

1. 校验用户对该空间所属 Tenant 的 Membership
2. 尊重 `X-Workspace-Id` 或切换接口，重签 JWT `wid`
3. 再做切换 UI

## 9. V2 扩展

- WorkspaceMembership（空间内角色）
- Project `ARCHIVED` 若与软删语义需要分开
- RLS
- 成员邀请
