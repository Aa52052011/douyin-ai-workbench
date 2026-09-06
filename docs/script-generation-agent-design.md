# Script Generation Agent 设计（script.generation:v1）

状态：**设计原稿。实现见 [script-generation-agent.md](./script-generation-agent.md)。** 不接 Video / Voice-Pro / FFmpeg / Douyin / SocialDataX / Redis / BullMQ / RAG / 影视剪辑。  
复用现有 Agent Engine / Registry / Context / AgentRun / ModelRouter / PromptRegistry。  
依据：[agent-engine.md](./agent-engine.md)、[content-planning-agent.md](./content-planning-agent.md)、[account-positioning-agent.md](./account-positioning-agent.md)、`database/prisma/schema.prisma`。

---

## 0. 现有模型盘点

当前关系：

```
Tenant
  └── Workspace
        └── Project
              ├── ContentPlan (payload.topics[] 为 JSONB，每条有稳定 UUID)
              │     └── Script? (contentPlanId 可选，无 topicId)
              └── AgentRun
Video.scriptId → Script（可选，本阶段不实现 Video）
```

### 现有 Script 字段

| 已有 | 结论 |
| --- | --- |
| `tenantId` `workspaceId` `projectId` | 保留。查询必须三键同时带上 |
| `contentPlanId` 可选 | 业务路径改为**必填**；列可继续可空，避免无规划的历史行 |
| `title` `content` `version` `status` | `title`/`version`/`status` 保留；`content` 改为旁路纯文本，正式结构进 `payload` |
| `deletedAt` | 已有，不重复加 |
| `@@index([contentPlanId, version])` | **不是唯一约束**，无法保证同 Topic 版本不冲突 |
| 无 `@@unique([id, tenantId])` | 与 ContentPlan / Video / AgentRun 不一致，建议补 |

### 缺口（实现阶段再改 Schema）

相对已落地的 ContentPlan，Script 缺：

- `topicId`：定位 JSONB 里的那一条 Topic
- `payload`：完整 `ScriptOutput`
- `sourceAgentRunId`：追溯 AgentRun，无级联
- `topicSnapshot`：生成时冻结 Topic，避免规划日后被改
- 同 Topic 的版本唯一约束
- 业务状态与 ContentPlan 对齐（见第 7 节）

**本阶段不建 Topic 表。** Topic 继续活在 `ContentPlan.payload.topics[]`。

---

## 1. Agent 定义

| 项 | 值 |
| --- | --- |
| `id` | `script.generation` |
| `version` | `v1` |
| `name` | 脚本生成 |
| `capabilities` | `script-generation`, `structured-output` |
| `defaultModel` | `process.env.MODEL_NAME`（不写死厂商） |
| `temperature` | `0.4` |
| `maxTokens` | `3500`（单条短视频脚本，远小于规划的 6000） |
| `timeoutMs` | `60000`（默认同 Engine；一条脚本足够） |

必须注册进现有 `AgentRegistry`。执行只走 `AgentEngine.execute()` → `InProcessAgentExecutor` / Internal HTTP。  
禁止第二套调度、禁止 `ScriptRun` 表、禁止 Script 专用 ModelProvider。

---

## 2. Input Schema

### 2.1 客户端 API 入参（白名单）

```ts
type CreateScriptRequest = {
  contentPlanId: string;      // UUID
  topicId: string;            // UUID，ContentPlan.payload.topics[].id
  targetDuration?: 15 | 30 | 45 | 60;  // 秒；省略则从 Topic.estimatedDuration 解析，失败则 30
  requirements?: string;      // <= 2000
};
```

**禁止**出现：`tenantId` `workspaceId` `projectId` `userId`。  
DTO `forbidNonWhitelisted`。隔离键只来自 JWT + 已校验 Project。

`contentPlanId` / `topicId` 是业务定位键，不是隔离键，允许出现。

### 2.2 Agent 内部 Input（服务端组装后）

客户端**不得**提交完整 Topic JSON。Backend 查库后组装：

```ts
type ScriptGenerationInput = {
  contentPlanId: string;
  topicId: string;
  topic: ContentTopic;                 // 从 payload.topics[] 取出的完整快照
  positioning: AccountPositioningOutput; // ContentPlan.positioningSnapshot
  platform: string;
  contentStyle?: string;
  planTitle?: string;
  targetDuration: 15 | 30 | 45 | 60;
  requirements?: string;
};
```

校验失败：`AGENT_INVALID_INPUT`。  
`targetDuration` 非 15/30/45/60：`SCRIPT_DURATION_NOT_AVAILABLE`（400）。  
V1 不开放 90s / 3min，避免字数与超时失控。

字数经验（口播中文约 4–5 字/秒，Prompt 与校验共用）：

| 时长 | 旁白总字数（约） |
| --- | --- |
| 15s | 60–80 |
| 30s | 120–160 |
| 45s | 180–230 |
| 60s | 240–300 |

---

## 3. Topic 获取流程（实现时，本阶段不写代码）

```
Frontend
  POST /scripts { contentPlanId, topicId, targetDuration?, requirements? }
        │
        ▼
JWT → tenantId, workspaceId, userId, role
        │
        ▼
requireProject(tenantId, workspaceId, projectId)     // project 来自 ContentPlan，不信客户端
        │
        ▼
contentPlan = findFirst({
  id: contentPlanId,
  tenantId,
  workspaceId,
  projectId,           // 必须属于当前项目
  deletedAt: null
})
        │  找不到 → 404 CONTENT_PLAN_NOT_FOUND（跨租户/空间/项目一律 404）
        ▼
V1 仅允许 ContentPlan.status ∈ { CONFIRMED, ARCHIVED }
DRAFT → 409 SCRIPT_PLAN_NOT_CONFIRMED
（确认前规划仍可能 PATCH，禁止在漂移的草稿上写脚本）
        │
        ▼
topic = payload.topics.find(t => t.id === topicId)
        │  无此 id → 404 SCRIPT_TOPIC_NOT_FOUND
        ▼
组装 ScriptGenerationInput
  topic + positioningSnapshot + platform/contentStyle/planTitle
        │
        ▼
AgentsService.execute({
  agentId: 'script.generation',
  agentVersion: 'v1',
  projectId: contentPlan.projectId,
  input: assembled   // 仍不含 tenant/workspace/user
})
        │
        ▼
AgentRun COMPLETED + Schema 合法 ScriptOutput
        │
        ▼
ContentPlans 同款：新 Script 行 DRAFT，version 递增，写入 payload / topicSnapshot / sourceAgentRunId
```

禁止 `findUnique({ id })` 再补查租户。  
禁止信任客户端传来的 Topic 正文（可被改 hook / 支柱 / 痛点）。

---

## 4. Output Schema

必须：`LLM → JSON parse → Schema validation → ScriptOutput`。  
失败统一 `AGENT_INVALID_OUTPUT`。禁止把模型原文当成功结果。

```ts
type ScriptOutput = {
  title: string;
  hook: string;                 // 前 1–3 秒，可直接口播
  opening: string;
  sections: ScriptSection[];
  ending: string;
  cta: string;
  totalDuration: number;        // 秒，整数
  estimatedWordCount: number;   // 全部旁白字数（hook+opening+sections+ending+cta）
  voiceStyle: string;           // 给未来 TTS，如「冷静、中速、不鸡血」
  visualStyle: string;          // 给未来 Video Agent
  productionNotes: string[];    // 拍摄/字幕/禁忌，不是旁白
};

type ScriptSection = {
  sequence: number;             // 从 1 连续递增
  narration: string;            // 可直接 TTS，禁止镜头说明混进旁白
  visualSuggestion: string;     // 可直接给 Video Agent
  subtitle: string;             // 可直接上字幕，宜短于 narration
  duration: number;             // 秒，正整数
};
```

校验规则：

- 必填字符串非空；`sections.length >= 1` 且 `<= 12`
- `sequence` 为 `1..n` 且不跳号
- `totalDuration` 落在 `targetDuration ± 5` 秒内
- 各 `sections[].duration` 之和 + 约定的 hook/opening/ending 时长口径必须自洽  
  **V1 口径：** `totalDuration === sum(sections.duration)`；hook 算进第一节前 1–3 秒的口播，opening/ending/cta 分别落在首节 / 末节 narration 中，**不再另加隐藏时长字段**，避免 Video Agent 重复计时
- `estimatedWordCount` 与实际旁白字数偏差不超过 20%，否则 `AGENT_INVALID_OUTPUT`
- `contentPillar` 不要求模型再输出（已在 topic 快照）；但 narration 不得跑到定位支柱之外（Prompt 约束，不做 NLP 分类器）
- 禁止 Markdown / 代码块 / 解释文字
- 禁止编造播放量、粉丝、热搜、竞品数据

不在输出里写 `videoId` / `audioPath` / `filePath`。

---

## 5. Script Prisma 修改建议（只设计）

### 5.1 建议新增

| 字段 | 类型 | 为何需要 |
| --- | --- | --- |
| `topicId` | `String @db.Uuid` | `contentPlanId + topicId` 定位一条 JSONB Topic |
| `payload` | `Json` | 完整 `ScriptOutput`，Video Agent 只读这里 |
| `topicSnapshot` | `Json` | 生成时冻结 Topic；规划重跑或未来拆表不影响旧脚本 |
| `sourceAgentRunId` | `String? @db.Uuid` | 追溯执行；**无外键、无级联** |

### 5.2 建议保留并用法调整

| 字段 | 用法 |
| --- | --- |
| `title` | 取 `payload.title`，便于列表 |
| `content` | 拼接全部 narration，供检索/预览；**不是**正式结构 |
| `version` | 同 Topic 递增 |
| `status` | 见第 7 节 |
| `contentPlanId` | 生成路径必填 |
| `deletedAt` | 已有软删 |

### 5.3 不加的字段

| 不加 | 原因 |
| --- | --- |
| Topic 表 | JSONB UUID 已够；拆表留到跨计划检索真有需求 |
| `positioningSnapshot` 再拷一份 | 已在 ContentPlan；Script 经 `contentPlanId` 可取。若担心规划行被物理删，实现阶段可再拷；V1 规划 Restrict + 软删，不必双写 |
| `duration` 列 | 已在 payload.totalDuration；列表需要时再冗余 |
| Script ↔ AgentRun 外键 | 与 ContentPlan 一致，业务资产不随 Run 删除 |
| `GENERATING` 业务写入 | 生成是同步 `execute()`，状态在 AgentRun |

### 5.4 索引与唯一

```
@@unique([id, tenantId])
@@unique([tenantId, contentPlanId, topicId, version])
@@index([tenantId, workspaceId, projectId])
@@index([tenantId, contentPlanId, topicId])
@@index([tenantId, status])
```

`contentPlanId` / `topicId` 为 NULL 的旧行不参与该唯一（PostgreSQL NULL 不相等）。新生成路径两者必填。

租户隔离：`findFirst({ id, tenantId, workspaceId })`；按项目再加 `projectId`。跨租户 404。

`contentPlanId` 现有关系只有单列 FK，**无法**与必填 `tenantId` 组成 Prisma 复合外键（与 [database-architecture.md](./database-architecture.md) 一致）。写入时应用层保证 `Script.tenantId === ContentPlan.tenantId`。

建议 migration 名（实现阶段）：`add_script_topic_versioning`。

---

## 6. Version 方案

**粒度：同一个 `tenantId + contentPlanId + topicId` 递增。**

```
ContentPlan v2 / Topic A
  Script v1   DRAFT → CONFIRMED
  Script v2   重新生成，旧 v1 保留
  Script v3
```

- 重新生成 = **新行**，不覆盖
- 不同 Topic 各自从 1 开始
- 不同 ContentPlan 的同一逻辑选题是不同 `topicId`（系统 UUID），互不影响
- 已 CONFIRMED 的版本禁止 PATCH；要改内容就生成 v(n+1)
- 已挂 Video 的 Script（未来）禁止删行，只归档

**不**按「整个 Project 下所有 Script 一条 version 序列」。那样 Topic A 的 v3 和 Topic B 的 v1 会抢序号，列表无法阅读。

---

## 7. Status 方案

现有枚举：`DRAFT | GENERATING | READY | ARCHIVED`。

**产品状态与 ContentPlan 对齐，不引入 COMPLETED。**

| 产品语义 | 写入值 | 说明 |
| --- | --- | --- |
| 已生成、可改 | `DRAFT` | Agent 成功落库后的唯一入口 |
| 已确认、可进 Video | `CONFIRMED` | **实现时 ADD VALUE**，与 ContentPlan 一致 |
| 历史 | `ARCHIVED` | 不可恢复 |

允许：`DRAFT → CONFIRMED → ARCHIVED`。  
不允许：归档恢复、`CONFIRMED → DRAFT`、`DRAFT → ARCHIVED`、PATCH 非 DRAFT。非法 409 `SCRIPT_CONFLICT`。

**不采用 GENERATING 作为 Script 行状态。** 同步执行期间只有 AgentRun `RUNNING`。进程崩溃时不会留下永久 GENERATING 僵尸行。枚举值可留着不写。

**不采用 COMPLETED。** 该词已被 AgentRun / Video 使用。脚本是文稿，用 CONFIRMED 表示「可以交给 Video Agent」。现有 `READY` 也不再写入，避免和规划阶段「READY=已确认」的旧映射混在一起。

---

## 8. Prompt 设计

文件（实现时）：`apps/backend/src/agents/prompts/script-generation.prompt.ts`  
注册键：`script.generation:v1`  
禁止写在 Controller / Service / Engine。

System 必须要求：

1. 只输出一个 JSON 对象，不要 Markdown、代码块、解释
2. 字段与 `ScriptOutput` 完全一致
3. 总时长对准 `targetDuration`，按第 4 节字数表控制旁白
4. Hook 必须在前几秒建立冲突或痛点，承接 Topic.hook，允许润色不许跑题
5. 人设、语气与 `positioning.persona` 一致
6. 内容支柱与 `topic.contentPillar` 一致，对准 `painPoint` / `contentAngle`
7. 不编造事实、数据、热搜、播放量、竞品名（用户没给的）
8. CTA 服务账号目标与 Topic.cta，可润色
9. `narration` 只含可朗读句子，不含「镜头切到…」
10. `visualSuggestion` 用祈使短句描述画面，供 Video Agent
11. `subtitle` 可独立上屏，短于或等于 narration
12. `voiceStyle` / `visualStyle` 从定位的 tone / formats 推导，不发明新人格
13. 无趋势数据时不要假装「正在热搜」

User 模板变量：`platform` `targetDuration` `requirements` `planTitle` `contentStyle` `topic` `positioning`（JSON 字符串）。

---

## 9. ModelRouter

```
script.generation:v1
  → PromptRegistry.render('script.generation', 'v1', vars)
  → ModelRouter.generate({
      agentId, tenantId, task: 'script.generation',
      responseFormat: 'json',
      temperature, maxTokens, messages
    })
```

禁止 Agent 内 `fetch` Router One / DeepSeek。  
`NODE_ENV=test` 或未配 `MODEL_*` → Mock（按 `targetDuration` 吐合法 JSON）。  
开发环境沿用现有 RealModelProvider。不新增 Script 专用 Provider。

日志：只记 `requestId` `agentId` `agentVersion` `duration` `token usage` `errorCode`。不打 API Key / Token / 完整 Prompt / 完整响应。

---

## 10. AgentRun

继续用 `agent_runs`。`agentId=script.generation` `agentVersion=v1`。

记录：`tenantId` `workspaceId` `projectId` `status` `requestId` `input` `output` `error` token 字段 `startedAt` `completedAt`。  
`input` 存组装后的 `ScriptGenerationInput`（含 topic / positioning 快照，便于审计）。  
**不建 ScriptRun 表。**

Script 是业务资产；AgentRun 是执行记录。删 Run 不删 Script。

---

## 11. ContentPlan → Script 数据链与隔离

```
ContentPlan (CONFIRMED|ARCHIVED)
  payload.topics[i].id
        ↓
script.generation:v1
        ↓
AgentRun
        ↓
Script { contentPlanId, topicId, version, payload, topicSnapshot, sourceAgentRunId }
```

每一层查询：

| 对象 | 条件 |
| --- | --- |
| Project | `id + tenantId + workspaceId + deletedAt=null` |
| ContentPlan | 上列 + `projectId` + `id` |
| Topic | 该 plan 的 `payload.topics[].id`，不是全局搜 UUID |
| Script | `id + tenantId + workspaceId`（列表再加 `projectId` / `contentPlanId` / `topicId`） |

跨租户 / 跨空间 / 跨项目 / 跨规划：一律 404。权限不足：403（`agent:execute` / `project:update`）。

---

## 12. Script → Video 未来接口（不实现）

```
CONFIRMED Script.payload
  → video.generation:v1
  → Video.scriptId = Script.id
```

Video Agent **只消费 ScriptOutput**，不要再向 Frontend 要一份旁白。

| ScriptOutput 字段 | Video / TTS 用法 |
| --- | --- |
| `sections[].narration` + hook/opening/ending/cta | Voice-Pro / TTS 分轨 |
| `sections[].subtitle` | 字幕轴 |
| `sections[].visualSuggestion` + `duration` | 画面/素材/切点 |
| `voiceStyle` | TTS 风格 |
| `visualStyle` | 画面风格、字幕模板 |
| `totalDuration` | 成片目标时长 |
| `productionNotes` | 后期约束，不进音轨 |

Video 仍不存二进制到 Postgres。本阶段不接 Voice-Pro / FFmpeg。

---

## 13. Frontend（本阶段不实现）

| 路径 | 职责 |
| --- | --- |
| `/dashboard/scripts` | 选项目 → 选已确认 ContentPlan → Topic 列表 → 生成 / 看版本 / 状态 |
| `/dashboard/scripts/[id]` | 脚本正文：hook、opening、分镜 sections、ending、CTA；voice/visual；版本；状态；确认/归档；重新生成（新 version） |

展示：`requestId`、耗时 `durationMs`、token（来自关联 AgentRun）。  
不展示 Prompt、API Key、完整模型原文。  
不做时间线剪辑器、不做配音试听、不做日历。

---

## 14. 测试方案（只设计）

### Agent

1. `script.generation:v1` 注册与 discovery  
2. Input 缺 `contentPlanId` / `topicId`  
3. 伪造 `tenantId` / `workspaceId` / `userId` → 400  
4. `targetDuration` 非 15/30/45/60 → `SCRIPT_DURATION_NOT_AVAILABLE`  
5. Mock 成功，输出过 Schema  
6. 非 JSON → `AGENT_INVALID_OUTPUT`  
7. 缺 sections / 时长对不上 → `AGENT_INVALID_OUTPUT`  
8. Real Provider 错误 / timeout 冒泡  
9. 响应不含 API Key / Token / Prompt  

### 编排与隔离

10. Topic 不存在 → 404  
11. Topic 属于另一份 ContentPlan → 404  
12. ContentPlan 跨租户 / 跨 workspace / 跨 project → 404  
13. DRAFT 规划生成脚本 → 409  
14. `positioningSnapshot` 进入 Agent input 且写入可审计  

### Script 业务

15. 创建 DRAFT、`version=1`、`sourceAgentRunId`、`payload`、`topicSnapshot`  
16. 同 Topic 再生成 `version=2`，v1 保留  
17. 另一 Topic 从 1 开始  
18. PATCH 仅 DRAFT；CONFIRMED / ARCHIVED 409  
19. `DRAFT → CONFIRMED → ARCHIVED`；归档不可恢复  
20. MEMBER 无 `agent:execute` → 403  

`NODE_ENV=test` 必须 Mock。真实模型仅 opt-in integration。

---

## 15. 与 movie.editing:v1 的边界

| | `script.generation:v1` | `movie.editing:v1` |
| --- | --- | --- |
| 输入 | 定位快照 + 一条 Topic | 成片素材、时间线、对白轨 |
| 输出 | 口播脚本 + 分镜建议 | 剪辑决策 / 成片元数据 |
| 数据 | 不读素材路径 | 不读抖音 Topic 也必须能跑 |
| 禁止 | 镜头匹配、FFmpeg、字幕烧录 | 写营销 Hook、发明账号人设 |

**可复用（以后）：** AgentRegistry / Engine / Run / ModelRouter / Prompt 版本化 / 结构化 JSON 校验 / `sections` 的「时长 + 文本」想法。  
**不可复用：** 本 Agent 的抖音口播 Prompt、ContentPlan 依赖、CTA 营销逻辑。

不要在 Script Prompt 里写「根据剧集素材剪辑」。

---

# 最终输出

## A. Script Agent 最终架构

```
JWT + POST /scripts
  → 校验 Project / ContentPlan / Topic
  → 组装 ScriptGenerationInput
  → AgentEngine.execute(script.generation:v1)
  → ModelRouter.generate()
  → JSON + Schema
  → AgentRun COMPLETED
  → Script DRAFT（新 version）
  → 人工 CONFIRMED
  →（未来）video.generation:v1
```

无第二套 Executor。无 ScriptRun。无 Topic 表。

## B. Input Schema

见第 2 节。客户端只有 `contentPlanId` `topicId` `targetDuration?` `requirements?`。

## C. Output Schema

见第 4 节 `ScriptOutput` / `ScriptSection`。

## D. Script Prisma 修改建议

见第 5 节。最少加：`topicId` `payload` `topicSnapshot` `sourceAgentRunId`、`CONFIRMED`、`(tenantId, contentPlanId, topicId, version)` 唯一、`(id, tenantId)` 唯一。

## E. Version 方案

按 `tenant + contentPlan + topic` 递增，旧行保留。

## F. Status 方案

`DRAFT → CONFIRMED → ARCHIVED`。不写 GENERATING / READY / COMPLETED。

## G. Prompt 设计

`agents/prompts/script-generation.prompt.ts`，`script.generation:v1`。要求见第 8 节。

## H. Agent Engine 调用链

`ScriptsService` → `AgentsService.execute` → `AgentEngine` → `InProcessAgentExecutor.runScriptGeneration` → `PromptRegistry` → `ModelRouter.generate` → `validateScriptOutput`。

## I. ContentPlan → Script 数据流

见第 3、11 节。Topic 只从服务端 JSONB 读取。

## J. Script → Video 未来接口

见第 12 节。Video 读 `Script.payload`，挂 `Video.scriptId`。

## K. Frontend 页面设计

`/dashboard/scripts`、`/dashboard/scripts/[id]`。见第 13 节。本阶段不实现。

## L. 测试方案

见第 14 节。

## M. 实现阶段预计文件（现在不要创建）

新增：

- `apps/backend/src/agents/definitions/script-generation.agent.ts`（及 types / fixture / spec）
- `apps/backend/src/agents/prompts/script-generation.prompt.ts`
- `apps/backend/src/scripts/`（module / controller / service / dto）
- `apps/backend/test/script-generation.e2e-spec.ts`
- `apps/frontend/src/app/dashboard/scripts/`
- `docs/script-generation-agent.md`
- `database/prisma/migrations/*_add_script_topic_versioning/`

修改：`schema.prisma`、`agent.registry.ts`、`in-process.executor.ts`、`agent.service.ts`、`mock.provider.ts`、`app.module.ts`、相关 docs。

## N. 本阶段不允许修改

- 任何业务代码、测试实现、前端页面
- Prisma Schema 与 migration
- 依赖安装
- 真实模型调用 / 跑脚本
- Video / Voice-Pro / FFmpeg / Douyin / SocialDataX / Redis / BullMQ / RAG / 电视剧剪辑
- Topic 表、Script 表结构落地

---

设计完成。等待实现指令后再改代码。
