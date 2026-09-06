# Content Planning Agent 设计（content.planning:v1）

状态：**设计原稿。实现见 [content-planning-agent.md](./content-planning-agent.md)。** 实现阶段已落地 Prisma 版本化与 `CONFIRMED` 状态。不接 SocialDataX。  
复用现有 Agent Engine / Registry / Context / AgentRun / ModelRouter / PromptRegistry。  
依据：[agent-engine.md](./agent-engine.md)、[account-positioning-agent.md](./account-positioning-agent.md)、`database/prisma/schema.prisma`。

---

## 1. 目标

`content.planning:v1` 根据 **已确认的账号定位** 与 **用户规划参数**，生成一份可编辑、可版本化的内容规划。

它是流水线的中间核心对象，不是一篇文章：

```
账号定位 → 内容规划 → 选题(Topic) → 脚本 → 视频 → 发布 → 复盘
```

V1 只用：定位快照 + 规划参数 + LLM。趋势数据可选，缺省也能跑。

---

## 2. Agent 职责

| 做 | 不做 |
| --- | --- |
| 按支柱分配选题 | 不写完整脚本 |
| 产出结构化 Topic 列表 | 不存视频/音频路径 |
| 给出 hook / 角度 / CTA / 理由 | 不操作抖音 |
| 写入 AgentRun | 不调 SocialDataX / 浏览器 / 队列 |
| （实现阶段）落库为 ContentPlan 版本 | 不伪造热门数据 |

Agent 只负责 **生成并校验** `ContentPlanOutput`。  
**确认 / 归档 / 编辑出新版本** 是业务 API，不是 Agent 的事。

---

## 3. 输入

三块，均不得含 `tenantId` / `workspaceId` / `projectId` / `userId`。

1. **账号定位快照**（结构对齐 `AccountPositioningOutput`）
2. **规划参数**：`planningDays` `postsPerDay` `platform` `contentStyle?` `additionalRequirements?`
3. **可选** `trendData`（未来 TrendDataProvider 填入；V1 可省略）

定位来源（实现时）：

- 优先 `positioningRunId`：该项目下 `agentId=account.positioning` 且 `COMPLETED` 的 Run，跨租户 404。
- 或省略：取该项目最近一次成功定位 Run。
- **服务端把定位快照拷进本次 input / 规划 payload**，避免定位被重跑后改写历史规划。

---

## 4. 输出

必须走：LLM → JSON parse → Schema 校验 → `ContentPlanOutput` → AgentRun `COMPLETED`。  
失败：`AGENT_INVALID_OUTPUT`。禁止把原始模型文本当成功结果。

`usedTrendData` 必须由服务端根据是否注入了非空 `trendData` 写入，**不信任模型自报**。  
无趋势时 payload 必须带声明：`trendNote: "当前规划未使用实时趋势数据"`。

---

## 5. Input Schema

```ts
type ContentPlanningInput = {
  positioning: AccountPositioningOutput; // 与 account.positioning:v1 输出同构
  planningDays: 7 | 14 | 30 | 60;
  postsPerDay: 1 | 2 | 3 | 4 | 5;
  platform: string;           // <= 50
  contentStyle?: string;      // <= 200
  additionalRequirements?: string; // <= 2000
  positioningRunId?: string;  // UUID，可选
  trendData?: TrendDataSnapshot;   // 可选，V1 不填
};

type TrendDataSnapshot = {
  source: string;             // 如 'socialdatax'，不得写死 SDK
  capturedAt: string;         // ISO
  items: Array<{
    keyword: string;
    heat?: number;
    note?: string;
  }>;
};
```

服务端硬限制（超出即 `AGENT_INVALID_INPUT`，不调模型）：

| 字段 | 规则 |
| --- | --- |
| planningDays | 仅 7 / 14 / 30 / 60 |
| postsPerDay | 1–5 整数 |
| topicCount | `planningDays * postsPerDay`，且 **V1 ≤ 60** |
| 60×5=300 | **拒绝**。提示缩小周期或每天条数。V2 再分片/异步 |

原因：一次 300 条会超时、超 token，且难以校验去重。V1 允许组合例如 30×2、14×4、60×1。

`positioning` 缺支柱 / 痛点 / 人设 → `AGENT_INVALID_INPUT`。

---

## 6. Output Schema

```ts
type ContentPlanOutput = {
  title: string;
  summary: string;
  planningDays: 7 | 14 | 30 | 60;
  postsPerDay: number;
  platform: string;
  usedTrendData: boolean;
  trendNote: string;
  pillarAllocation: Array<{
    pillarName: string;
    percentage: number;
    topicCount: number;
  }>;
  topics: ContentTopic[];
};

type ContentTopic = {
  id: string;                 // UUID，本规划版本内稳定
  dayIndex: number;           // 1..planningDays
  title: string;
  hook: string;
  contentPillar: string;
  targetAudience: string;
  painPoint: string;
  contentAngle: string;
  format: string;
  estimatedDuration: string;  // 如 '30-45s'
  priority: 'high' | 'medium' | 'low';
  reason: string;
  keywords: string[];
  cta: string;
  status: 'planned';          // 生成时固定 planned
  scheduledDate?: string;     // YYYY-MM-DD，可选
};
```

校验：

- `topics.length === planningDays * postsPerDay`
- 每条 `id` 合法 UUID、标题/hook/pillar/painPoint/angle/cta/reason 非空
- `contentPillar` 必须落在定位的 `contentPillars[].name` 中
- 支柱分配的 `topicCount` 之和等于 topics 长度
- 禁止 Markdown 包裹

V1 **不**在输出里写 `scriptId` / `videoId`。关联在后续表上。

---

## 7. Prompt 设计

注册：`content.planning:v1`（`apps/backend/src/agents/prompts/`，实现阶段再写文件）。

必须要求模型：

1. 按定位支柱分配，比例接近 `percentage`
2. 选题互不重复（题、角度、hook 均需差异）
3. 对准 `userPainPoints` / 受众痛点
4. 每条给 reason、contentAngle、hook、cta、时长、priority
5. 人设（identity / tone）一致
6. **不虚构** 热度、播放、竞品数据
7. 无 `trendData` 时写死 `trendNote` 为「当前规划未使用实时趋势数据」，`usedTrendData=false`
8. 只输出一个 JSON 对象

temperature：0.4–0.5（Definition 上配置，不写死 Engine）。  
timeout：建议 90s（7/14 天）；30/60 天若逼近上限再在 Definition 调到 120s。  
maxTokens：建议 4000–8000，随 topicCount 升，仍由 Definition 配置。

---

## 8. Agent Context

沿用：

```
{ userId, tenantId, workspaceId, projectId, requestId, locale }
```

不塞完整 User / Token。定位快照在 **input**，不进 Context。

---

## 9. ModelRouter

只调用 `ModelRouter.generate()`（`responseFormat: 'json'`、messages、temperature、maxTokens）。  
禁止 Agent 内 HTTP、禁止点名 Router One / DeepSeek。模型由 Router + 环境变量决定。

---

## 10. AgentRun

继续用 `agent_runs`，不新增执行表。

记录：`agentId=content.planning` `agentVersion=v1` `tenantId` `workspaceId` `projectId` `requestId` `status` `input` `output` token / duration。

input 可存定位快照（业务需要）；日志仍只记 hash / 长度 / errorCode，不打完整 Prompt。

---

## 11. 权限

- 生成：`agent:execute` + JWT
- 读规划：登录即可（与现有 GET /agents 一致）
- 确认/归档/改稿：建议复用 `project:update`（实现阶段加权限项也可，V1 不必新造角色）

`projectId` 必须 `findFirst({ id, tenantId, workspaceId, deletedAt: null })`。  
客户端禁止传 tenant / workspace / userId。跨租户 404。

---

## 12. 现有 ContentPlan 是否够用

**不够。** 现表只有 title / description / status / 起止日期，没有：

- 版本号
- 定位快照
- Topic 列表
- 规划参数
- 来源 AgentRun
- 是否使用趋势

现有 `ContentPlanStatus`：`DRAFT | GENERATING | READY | ARCHIVED`。

映射（不改枚举也可）：

| 产品语义 | 现有枚举 |
| --- | --- |
| 生成中 | GENERATING |
| 草稿（可编辑） | DRAFT |
| 已确认 | READY |
| 已归档 | ARCHIVED |

**不要**为「Confirmed」再加枚举，除非产品文案强依赖该词。

---

## 13. Topic 数据模型（逻辑）

见第 6 节 `ContentTopic`。稳定字段供 Script Agent 消费。  
预留但不落在 V1 表上：`scriptId` `videoId`（由 Script / Video 反查）。

---

## 14. 版本机制

- 一次成功生成 = **一行新 ContentPlan**，`version` 在项目内递增（1, 2, 3…）。
- **禁止**在 READY 规划上原地改 topics。
- 编辑：复制 payload → 改 JSON → **新 version**，旧行不动。
- 确认：仅 DRAFT → READY；同一项目可允许多个 DRAFT，**建议同时最多一个 READY**（新确认时把旧 READY 归档），便于「当前生效规划」查询。
- Script / Video 只挂 `contentPlanId`（+ 未来 `topicId`），因此能回答：「这个视频来自规划 v2 的哪条 Topic」。

AgentRun 是生成审计；ContentPlan 是产品版本。两者都要，不互相替代。

---

## 15. TrendDataProvider（只设计）

```ts
interface TrendDataProvider {
  readonly id: string;
  getTrendData(query: {
    platform: string;
    niches: string[];
    locale?: string;
  }): Promise<TrendDataSnapshot | null>;
}
```

V1：**不注册真实实现**。可有 `NoopTrendDataProvider` 返回 `null`（实现阶段）。  
Agent 只吃可选 `trendData`，不 import SocialDataX。

---

## 16. SocialDataX 未来接入

```
ContentPlanning 编排
  → TrendDataProvider.getTrendData()
  → SocialDataXProvider（未来）
  → 写入 input.trendData
  → content.planning Agent（仍只见快照）
```

禁止 Agent 绑 SocialDataX SDK。无数据则 `usedTrendData=false`，禁止模型编造热度。

---

## 17. Frontend（本阶段不实现）

路径：`/dashboard/content-planning`

1. 选项目  
2. 展示最近定位（只读）  
3. 周期 7/14/30/60、每天 1–5、风格、补充要求  
4. 生成中 / 失败  
5. 卡片列表看 Topic（非整份 JSON.stringify）  
6. 草稿编辑 → 另存为新版本  
7. 确认 / 归档  
8. 版本列表  

不展示 Prompt / API Key / Internal Secret。显示 requestId、耗时、token。

---

## 18. API 设计（先设计）

生成仍走现有引擎，避免第二套执行器：

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/agents/runs` | agent:execute | `agentId=content.planning`，校验后跑模型 |
| POST | `/content-plans` | project:update | body：`projectId` + `agentRunId`，把校验过的 output 落成 DRAFT |
| GET | `/content-plans?projectId=` | JWT | 当前租户+空间+项目 |
| GET | `/content-plans/:id` | JWT | 跨租户 404 |
| PATCH | `/content-plans/:id` | project:update | 仅 DRAFT 改 title/summary/topics；或 `saveAsNewVersion:true` |
| POST | `/content-plans/:id/confirm` | project:update | DRAFT→READY，可选归档旧 READY |
| POST | `/content-plans/:id/archive` | project:update | →ARCHIVED |

**不建议**单独 `POST /content-plans/generate` 作为唯一入口（会绕开统一 `/agents/runs`）。若要一个按钮，前端串：runs → persist。  
编排接口若做，也必须内部调用 AgentEngine，不能直连模型。

---

## 19. 错误处理

复用：`AGENT_INVALID_INPUT` `AGENT_INVALID_OUTPUT` `AGENT_NOT_FOUND` `AGENT_FORBIDDEN` `AGENT_TIMEOUT` `MODEL_*` `PROJECT_NOT_FOUND`。

可在实现时增加（仍走 AppError）：

- `CONTENT_PLAN_NOT_FOUND`（404）
- `CONTENT_PLAN_NOT_DRAFT`（409，确认/编辑）
- `CONTENT_PLAN_TOPIC_LIMIT`（400，条数超 60）

不回传模型原文与密钥。

---

## 20. 测试计划（实现阶段）

1. Registry 发现 `content.planning:v1`  
2. 无定位 / 缺 days / days 非法 / postsPerDay=6 / 60×5 失败  
3. Mock 结构化输出条数正确  
4. 非 JSON / schema 失败 → INVALID_OUTPUT  
5. 无 trendData 时 `usedTrendData=false` 且 trendNote 固定文案  
6. 租户/空间/项目隔离  
7. 无权限 403  
8. 落库 DRAFT + version  
9. 确认 READY、再生成不覆盖旧行  
10. 不泄露 Token / Key  
11. Frontend build（做到页面时）  
12. 真实 LLM 仅 integration 开关，默认 Mock  

---

## 21. 未来 Script Agent

```
READY ContentPlan + topic.id
  → script.generation:v1
  → Script { contentPlanId, topicId, version }
```

Topic 字段（title/hook/angle/cta/时长/人设来自规划快照）即脚本输入。  
V1 不建 Topic 表时，`topicId` 仍是 JSON 内 UUID；实现 Script 时再加 `scripts.topic_id` 列（无外键或延迟建表）。

---

## 22. 未来 Video Agent

```
Script → video.generation:v1 → Video.scriptId
```

ContentPlan **不存** filePath / 音频 / 模型原始输出。Video 表已有路径字段。

---

## 23. 未来 Douyin Agent

```
Video → douyin.publish:v1
```

规划只回答「发什么」（Topic）；发布只回答「怎么发」。禁止 ContentPlan 存 cookie / 账号 token。

---

## 24. 未来 Movie Editing Agent

```
素材 → movie.editing:v1 → 成片（可再挂 Video）
```

与 planning / script / douyin **解耦**。Topic 仍可用同一结构：title、hook、angle、format、duration、cta。  
影视项目可没有抖音 positioning，但 Topic 契约保持稳定。

---

## 25. Topic：JSONB vs 独立表

| 维度 | V1 JSONB（推荐） | 现在就建 Topic 表 |
| --- | --- | --- |
| 开发速度 | 快，一次写入 | 300 行事务、编辑复杂 |
| 查询 | 按计划列表够用 | 按 pillar/日期筛选更强 |
| 扩展 | Script 阶段再拆表 | 过早 |
| 分析 | V1 不做跨计划聚合 | 有利 |
| 多租户 | 跟 ContentPlan 行走 | 还要复合 FK |
| 版本 | 整份 payload 复制即可 | 行级复制易漏 |

**结论：V1 用 ContentPlan JSONB 存 topics（每条自带 UUID）。不新建 Topic 表。**  
Script Agent 落地时再评估拆 `content_topics`（`tenant_id` + `content_plan_id` + `id`）。

---

## 26. V1 最小数据库改造（只提案，本阶段不执行）

现表保留。实现 `content.planning` 落库时 **最少**加：

```prisma
model ContentPlan {
  // 已有字段保留
  version               Int      @default(1)
  planningDays          Int?     @map("planning_days")
  postsPerDay           Int?     @map("posts_per_day")
  platform              String?
  usedTrendData         Boolean  @default(false) @map("used_trend_data")
  sourceAgentRunId      String?  @map("source_agent_run_id") @db.Uuid
  positioningRunId      String?  @map("positioning_run_id") @db.Uuid
  payload               Json     // ContentPlanOutput + positioning 快照
  // ...
  @@unique([projectId, tenantId, version])
}
```

- `payload`：完整规划 + `positioningSnapshot`。  
- 不加 Topic 表。  
- 不加 Script.topicId（留给 Script 阶段）。  
- 枚举不改，用 READY=已确认。

索引：已有 `(tenantId, workspaceId, projectId)`、`(tenantId, status)` 足够；版本用新 unique。

---

## 27. 实现阶段推荐顺序（未开工）

1. 扩 ContentPlan 列 + migration（仅到实现阶段）  
2. 注册 Agent / Prompt / 校验  
3. `POST /agents/runs` 跑通 Mock + 真实模型  
4. 落库 + confirm/archive  
5. 极简 `/dashboard/content-planning`  

本设计阶段到此为止。
