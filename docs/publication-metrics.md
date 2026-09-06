# Publication Metrics（Step 9.2–9.4）

状态：**数据地基 + Manual Metrics API + MOCK API sync + deterministic Aggregator + deterministic Performance Insight + compact feedback → content.planning:v1 + structured IMPORT + CSV/XLSX Preview/Confirm 已落地。无 Desktop automation。无真实平台拉取。无 scheduler。**

依据：[database-architecture.md](./database-architecture.md)、[job-queue-worker.md](./job-queue-worker.md)、[publishing-foundation.md](./publishing-foundation.md)。

---

## 对象边界

| 对象 | 是什么 | 不是什么 |
| --- | --- | --- |
| Video | 内部成片 | 不是外部作品，不作为新 Metrics 归属 |
| Publication | 某平台的一次外部作品 | 不是 Video，不是 Job |
| PublicationMetricSnapshot | 该 Publication 在 `observedAt` 的表现 | 不是累计表，不是 Insight |
| Job | `JobKind.PUBLICATION_METRICS_SYNC` 将来承载 API 同步 | Step 9.2 仅 enum；执行 fail closed |
| 旧 Analytics | **DEPRECATED / NO NEW WRITES** 的 Video 级快照 | 不是新 SoT。不要补 `publicationId` / `platform` / `source` |

新 SoT = `PublicationMetricSnapshot`。append-mostly。禁止只挂 `videoId`。

---

## MetricSource vs provider

`source` 表示数据怎么进入系统：`API` `MANUAL` `IMPORT`。没有 `SCRAPE`，也没有 `MOCK` source。

`provider` 是谁提供数据（`String?`），不必等于 `Platform` enum。

约定：

| 采集 | source | provider |
| --- | --- | --- |
| Douyin API | `API` | `DOUYIN` |
| Mock API（9.4） | `API` | `MOCK` |
| 手工录入（9.3） | `MANUAL` | `MANUAL` |
| 文件导入 / Desktop Assisted（9.9B） | `IMPORT` | `CSV_IMPORT` / `XLSX_IMPORT` / `DESKTOP_ASSISTED` / `STRUCTURED_IMPORT` |

禁止把 secret / raw endpoint 写入 `provider` 或 `providerMetadata`。

---

## Nullable metrics

`views` `likes` `comments` `shares` `favorites` `averageWatchTimeSeconds` `completionRate` `newFollowers` 全部可空。

- `null` = unknown / unavailable / not supplied
- `0` = 平台或用户明确报告 0
- 禁止 `@default(0)`

`completionRate` 一律 **0–1**（`0.63` = 63%）。不要混用百分数。

`averageWatchTimeSeconds` 为 `Decimal(12,3)`，允许小数秒。

计数 V1 继续 `Int`。JSON/DTO 没有稳定 BigInt 序列化。上限约 2,147,483,647，记为技术债。

---

## collectionKey

不可空。幂等唯一：`(tenantId, publicationId, source, collectionKey)`。

同一次采集重放不得插两行。不同合法采集（不同 key，或同 key 不同 source）允许多行。不要用 `(publicationId, observedAt)` unique。

---

## platform / sourceJobId / metadata

- `platform` 反规范化自 `Publication.platform`。Prisma 无法方便表达相等约束 → **Service invariant**（9.3 写入时从 Publication 拷贝，禁止客户端自选不一致平台）。
- `sourceJobId` 是 UUID 引用，**无 Job FK**（与 `Publication.sourceJobId` 相同）。Manual 为 null。
- `providerMetadata` 只允许 requestId / snapshotId / apiVersion / mappingVersion / 非秘密 errorCode。经 `sanitizeMetricsProviderMetadata()`。不要复用 `Publication.providerResponseMetadata` 存指标。Snapshot **不含** credentialRef / token。

---

## Provider contract

`PlatformMetricsProvider.getPostMetrics(input)` 是 V1 唯一方法。没有 account / comments / audience / trending / syncAll。

`GetPostMetricsInput` 带 tenant/workspace/project、publicationId、videoId、platform、**必填 `externalPostId`**、可选 `platformAccount`（无 token）与 `credentialRef`（SecretStore UUID）。禁止 plaintext token。没有 `urlToMetrics()`。Manual Publication 只有 URL 没有 `externalPostId` 时，未来 API sync 应明确失败；9.3 手工指标不受影响。

`PostMetricsResult` 归一化后计数/比率为 `number | null`。`undefined` 视为缺失（null），不得变成 0。负数与 `completionRate` 越出 0–1 拒绝：`METRICS_PROVIDER_INVALID_RESPONSE`。不要求累计值单调增长。

Registry：所有平台含 MOCK 当前均为 `PLATFORM_METRICS_PROVIDER_NOT_IMPLEMENTED`。MockMetricsProvider 留 9.4。禁止 fallback。PublishingProvider / DouyinOAuthClient 不受影响。

---

## Capability

纯函数 `canReadPostMetrics(platform, scopes)`。不建 `PlatformCapability` 表。

- Douyin `user_info` **不是** metrics 能力。OAuth 已连接 ≠ 可拉指标。
- 测试占位 scope：`mock.metrics.read`，仅 MOCK。不是官方 Douyin scope。
- 真实 Douyin metrics scope 在 Step 9.9 查官方文档后确定。

---

## Job

`PUBLICATION_METRICS_SYNC` 复用 Job。JobProcessor 分发到 `MetricsSyncExecutionService`。禁止 fallback 到 `VIDEO_GENERATION` / `VIDEO_PUBLISH`。未知 kind 仍 `JOB_KIND_UNSUPPORTED`。

真实平台（Douyin / TikTok / YouTube / …）registry 仍 `PLATFORM_METRICS_PROVIDER_NOT_IMPLEMENTED`。

---

## Manual Metrics API（Step 9.3）

手工指标不是平台 API 验证。用户把后台看到的数字告诉系统。不要求 PlatformAccount、OAuth、`externalPostId`、metrics scope，也不调用 `PlatformMetricsProvider`。

### 路径

- `POST /publications/:id/metrics/manual` — 必须 `x-idempotency-key`
- `GET /publications/:id/metrics` — timeline，`observedAt DESC, createdAt DESC, id DESC`；`limit` 默认 50、最大 200；可选 `before`（`observedAt < before`）
- `GET /publications/:id/metrics/latest` — 同上排序；无数据时 `200 { snapshot: null }`
- `GET /publications/:id/metrics/summary` — 运行时确定性聚合，不持久化
- `GET /publications/:id/metrics/insights` — 运行时确定性 Insight，不持久化

append-mostly。无 PATCH/DELETE。无未挂 Publication 的 `/metrics`。GET 同时返回 MANUAL、API 与 IMPORT snapshots；latest 按时间，不按 source。

### 写入规则

- 仅 `Publication.status = PUBLISHED` 且 `publishedAt` 非空。其它状态 → `PUBLICATION_METRICS_NOT_AVAILABLE`
- **不限制** `Publication.mode`：MANUAL 与 API 都可以写 MANUAL metrics
- `platform` 从 Publication 拷贝，客户端禁止传
- `source = MANUAL`，`provider = MANUAL`（与上表 Step 9.2 约定一致），`sourceJobId = null`，`providerMetadata = {}`
- 不创建 Job，不 enqueue，不调 Provider
- 至少一项 metric 非 null；未填 = null；显式 `0` 保留 0
- 计数整数 `0..2147483647`；`completionRate` 0–1（`63` 不换算）；watch time `>= 0` 允许小数
- `observedAt` 可省略（server now）或 ISO；`>= publishedAt`；`<= now + 5 minutes`

### 幂等

`collectionKey = manual:{idempotencyKey}`。unique `(tenantId, publicationId, source, collectionKey)`。

同 key + 同语义 → 返回已有行。同 key + 不同语义 → `IDEMPOTENCY_KEY_CONFLICT`。省略 `observedAt` 的 fingerprint 使用稳定 `SERVER_NOW`（用 `|observedAt - createdAt| <= 2s` 从现有字段重构），重试不因 `now()` 不同冲突。并发同请求经 unique race 后 reload + 语义比较，不 500。无 `requestFingerprint` 列。

### 权限

写：`PUBLICATION_CREATE`（OWNER / ADMIN / EDITOR）。读：与 GET Publication 相同，workspace member 可读。跨 tenant/workspace → 404。

### Public DTO

可返回 id / publicationId / platform / source / observedAt / providerCollectedAt / createdAt / 八项 metric / provider。

禁止返回 collectionKey / sourceJobId / providerMetadata / tenant 内部字段 / secrets。Prisma Decimal → JSON `number | null`。

---

## MOCK Metrics Sync（Step 9.4）

API-style 采集：`POST /publications/:id/metrics/sync`（必须 `x-idempotency-key`，`PUBLICATION_CREATE`）创建 Job 并立即返回 `{ job }`。不在 HTTP 里等 Provider。

前置：`status=PUBLISHED`、`publishedAt` 非空、`platform=MOCK`、`externalPostId` 必填。只有 URL 没有 externalPostId → `PUBLICATION_METRICS_EXTERNAL_ID_REQUIRED`。不抓 `externalUrl`。MOCK 不强制 PlatformAccount / OAuth。

Job：`kind=PUBLICATION_METRICS_SYNC`，`input={ publicationId }`，`videoId` 仅查询辅助，`requestId` = idempotency key。同 tenant + 同 key + 同 publication 返回已有 Job、不再 enqueue。同 key 不同 publication → `IDEMPOTENCY_KEY_CONFLICT`。并发用 advisory lock，无新 schema。

Queue payload 只有 `{ jobId }`。enqueue 失败：Job FAILED、`503 JOB_ENQUEUE_FAILED`、无 Snapshot、无 Provider。

Worker：`MetricsSyncExecutionService` claim / heartbeat / isolation → MockMetricsProvider → `normalizePostMetricsResult` → `PublicationMetricSnapshot(source=API, provider=MOCK, collectionKey=api:{jobId}, sourceJobId=Job.id)` → Job COMPLETED。

若同 Job 的 Snapshot 已存在：跳过 Provider，直接 finalize。TEMPORARY / PERMANENT / INVALID：Job FAILED，不插 Snapshot，**不自动重跑 Provider**；用户换新 idempotency key 再 sync。

Mock 场景（测试 hook，不进 public DTO）：SUCCESS / PARTIAL / ZERO / INVALID_RESPONSE / TEMPORARY_FAILURE / PERMANENT_FAILURE。确定性、无网络。

Manual 与 API snapshots 共存，source 区分，互不覆盖。

---

## Deterministic Aggregator（Step 9.6）

Snapshot = 事实。Aggregator = 纯本地统计。Insight = 确定性规则解释。Agent / LLM 属于后续步骤。

`GET /publications/:id/metrics/summary` 只读。权限与 GET metrics 相同。不创建 Job / Snapshot，不调 Provider，不读旧 Analytics。

窗口以 `publishedAt` 为原点：

- **H24**：`observedAt <= publishedAt + 24h` 中最新一条累计快照
- **D7**：`observedAt <= publishedAt + 7d` 中最新一条
- **LIFETIME**：latest 累计值，**禁止**把 snapshots 的 views/likes 相加

窗口内没有 snapshot → 该窗口 metrics 为 null，禁止用窗口之后的数据倒灌。

latest 排序与 GET latest 完全一致：`observedAt DESC, createdAt DESC, id DESC`。

比率仅在 `views > 0` 且分子已知时计算。`engagementRate` 要求 likes/comments/shares/favorites **全部已知**（`0` 可参与，`null` 不行）。completionRate 保持 0–1。watch time 保持秒（可小数）。

Delta 保留负值并打 `METRIC_DECREASE_DETECTED`。不把 publishedAt 当成 views=0。velocity = Δviews / Δhours，Δhours <= 0 或 views unknown → null。

允许 MANUAL+API 混合；输出 `sourcesUsed` 与 `MIXED_SOURCES`。同 `observedAt` 不 merge，按稳定最新规则选点，值不同则 `SAME_TIME_CONFLICT`。

`observationCoverage` 是窗口观察覆盖（相对 24h/7d），**不是**完播率。例如 H24：`min(windowCoverageHours / 24, 1)`。

V1 dataQualityFlags（稳定顺序）：`NO_SNAPSHOTS`、`SINGLE_SNAPSHOT_ONLY`、`MIXED_SOURCES`、`METRIC_DECREASE_DETECTED`、`SAME_TIME_CONFLICT`、`MISSING_VIEWS`、`SPARSE_24H`、`SPARSE_7D`。

V1 一次读取该 Publication 的全部 snapshots（当前单条量小）。未做 downsampling / 行数上限；量大时再加，且不能破坏 7D/LIFETIME 正确性。

本步骤不生成 performanceScore / HIGH_PERFORMING，不做账号 benchmark，不持久化 summary 表。

---

## Deterministic Performance Insight（Step 9.7）

Facts = Snapshot。Statistics = Summary。Interpretation = Performance Insight。Compact Feedback = Planning Context。Content Planning Agent = 决策/生成。

`GET /publications/:id/metrics/insights` 只读。权限与 GET summary 相同。流程：复用 `summary()` → 纯函数 `generatePerformanceInsights(summary)`。不重新实现 9.6 数学，不读旧 Analytics，不创建 Job / Snapshot / AgentRun，不调 Provider / LLM。

### 规则版本

`rulesVersion = v1`。阈值集中在 `PERFORMANCE_INSIGHT_RULES_V1`。这是**产品内部 heuristic**，不是 Douyin 官方或行业基准，也不是账号 / Project baseline。调整阈值必须升到 v2，禁止悄悄改 v1 语义。

V1 不做 FAST/SLOW view growth、HIGH/LOW_VIEWS：没有 follower count 与账号对照时，绝对播放量无法解释。

### Data sufficiency

- `NO_SNAPSHOTS` 或没有任何 views → `INSUFFICIENT`（只保留 DATA_QUALITY）
- `SINGLE_SNAPSHOT_ONLY`，或 H24 不可靠（无 views / `observationCoverage` < 0.5）→ `PARTIAL`（允许正向 insight，confidence 最高 MEDIUM；抑制 LOW_* / WEAK_*）
- 至少 2 条 snapshot 且 H24 views 已知且 `observationCoverage >= 0.5` → `SUFFICIENT`

### Codes（v1）

DATA_QUALITY：`INSUFFICIENT_DATA`、`MIXED_SOURCE_DATA`、`METRIC_DECREASE_DETECTED`、`SAME_TIME_CONFLICT`

ENGAGEMENT：`HIGH_LIKE_RATE` / `LOW_LIKE_RATE`、`HIGH_COMMENT_RATE`、`HIGH_SHARE_RATE`、`HIGH_FAVORITE_RATE`、`HIGH_ENGAGEMENT_RATE` / `LOW_ENGAGEMENT_RATE`

RETENTION：`STRONG_COMPLETION_RATE` / `WEAK_COMPLETION_RATE`

业务真相是 `code + evidence`，不是自然语言。`messageKey` 仅作 i18n 键，例如 `performanceInsight.v1.HIGH_SHARE_RATE`。

Rate insight 要求该窗口 `views >= 100` 且 rate 非 null。Retention 要求 `completionRate` 非 null、`views >= 100`；WEAK 还要求目标窗口 coverage >= 0.5 且 sufficiency = SUFFICIENT。同一 code 只选一个窗口，优先 H24 → D7 → LIFETIME。

Confidence：`HIGH` / `MEDIUM` / `LOW`。mixedSources、same-time conflict、sparse 目标窗口各降一级；PARTIAL 封顶 MEDIUM。禁止 0.87 这类假概率。

禁止因果（hook 差、选题好）与建议（下条视频应该……）。

---

## Compact Performance Feedback → Content Planning（Step 9.8）

`PerformanceFeedbackService.buildForProject` 在每次 `content.planning:v1` run 前即时构建。不落库独立表。compact JSON 写入 `AgentRun.input.performanceFeedback`。不新增公开 feedback API。

选择：当前 tenant + workspace + project、`PUBLISHED` 且 `publishedAt` 非空，按 `publishedAt DESC, createdAt DESC, id DESC` 取最近 10 条（上限 20）。

相同 insight code 跨作品聚合。`supportCount >= 2` 才进入主 signals。正向 / 表现谨慎 / 数据质量分开。INSUFFICIENT 作品不贡献表现 labels。无历史 → `dataState=NONE`；样本不足 → `LIMITED`；重复信号可用 → `USABLE`；正负冲突 → `MIXED`。

Feedback 不是因果，不能覆盖账号定位。ContentPlan output 合同不变。构建 feedback 不创建 Job、不调 metrics Provider、不刷新 metrics。

Metrics 模块不依赖 Planning。AgentsModule import MetricsModule。

---

## Structured IMPORT ingestion（Step 9.9B）

统一摄入地基。Desktop automation、官方 Douyin API **未**实现。CSV/XLSX 见 Step 9.9C。

SoT 仍是 `PublicationMetricSnapshot`。`MetricSource` 仍是 `API | MANUAL | IMPORT`。Desktop Assisted 未来也写 `source=IMPORT`，`provider=DESKTOP_ASSISTED`。

### 合同

内部 `NormalizedPublicationMetricsInput`：`publicationId`、`observedAt`、可选 `providerCollectedAt`、八项 metric（normalize 后仅为 `number | null`，`undefined` 变成 `null`，`0` 保持 `0`）、`provider`、清洗后的 `providerMetadata`、`collectionKey`。

`PublicationMetricsSnapshotWriter` 校验 PUBLISHED + `publishedAt`、`observedAt >= publishedAt`、normalize、sanitize metadata、幂等 unique `(tenantId, publicationId, source, collectionKey)`，返回 public DTO。Manual / API sync **尚未**迁到 Writer（future consolidation）。

`MetricsIngestionService` 只接受已结构化的一行。`source` 固定 `IMPORT`，`sourceJobId = null`。`collectionKey = import:{idempotencyKey}`，禁止客户端提供。

允许的 `provider` 字符串（不是 enum）：`CSV_IMPORT` `XLSX_IMPORT` `DESKTOP_ASSISTED` `STRUCTURED_IMPORT`。拒绝 `DOUYIN` / `MOCK` / `API` / `MANUAL` 等平台 API 冒充。

### API

`POST /publications/:id/metrics/import` — 必须 `x-idempotency-key`，权限 `PUBLICATION_CREATE`。Body：`observedAt`（必填）、`providerCollectedAt?`、`provider`、`metrics`、`providerMetadata?`。不解析文件，不调 `PlatformMetricsProvider`，不创建 Job。

同 key 同语义返回已有行；同 key 不同语义 → `IDEMPOTENCY_KEY_CONFLICT`。不覆盖旧 Snapshot。

### Publication matching

`PublicationMetricsMatcher` 供未来 CSV / Desktop 共用。范围强制 tenant + workspace + project。优先级：explicit `publicationId` → `externalPostId` / `itemId` / 可解析 URL item id → 精确 `externalUrl` → title + UTC 日 `publishedAt`（仅 `WEAK`）。0 命中 `UNMATCHED`，多命中 `AMBIGUOUS`。禁止 title 强匹配、跨隔离域、自动创建 Publication、自动改 `externalPostId`。Douyin URL 只认稳定 `video|note|share/video` 与 `modal_id`/`item_id`；短链不解析。

### CSV/XLSX Import（Step 9.9C）

`POST /metrics/import/preview`（multipart `file`，可选 `projectId` / `observedAtOverride`）只解析、匹配、返回 Preview，不写 Snapshot。`POST /metrics/import/confirm` 提交用户确认行；服务端重新校验后逐行调用 `MetricsIngestionService`。无 session 表。

- 格式：`.csv` / `.xlsx`。拒绝 `.xls`、`.xlsm`、OLE、zip 伪装 CSV、含 `vbaProject.bin` 的宏工作簿。
- 上限：1MB、200 行、40 列。V1 只读第一个有表头的 worksheet。不执行公式/宏。
- `mappingVersion = douyin-export-v1`：中文列名 alias 集中在 `DOUYIN_EXPORT_V1`，含创作者中心「作品列表导出」的 `作品名称` / `粉丝增量`。未识别列进 warnings，不静默猜列。`5s完播率` / `封面点击率` / `2s跳出率` / `主页访问量` 记为 `KNOWN_UNMAPPED_METRIC`，不写入 Snapshot。`-` / `--` / `N/A` → null。`33.00s` 仅由时长解析器处理。作品列表导出没有作品链接，匹配走 title + publishedAt = WEAK。
- 数值：`1,234`、`1.2万`、`3.5w`；完播率 `12%` → 0.12，`0.42` 可接受，裸 `42` 视为 ambiguous。
- `observedAt`：文件数据截止时间 → 导出时间 → Preview override。禁止静默 server now。
- 匹配复用 `PublicationMetricsMatcher`。EXACT 可默认 `suggestedPublicationId`；WEAK / AMBIGUOUS / UNMATCHED 必须用户给出 `publicationId`。禁止自动创建 Publication。
- 幂等：`collectionKey = import:{sha256(mappingVersion|publicationId|observedAt|metrics|provider)}`。行重排 / 重传同一确认行不重复写入。`fileFingerprint = sha256(bytes + mappingVersion)` 仅作 Preview/Confirm 关联，不进 collectionKey。
- V1 不保存原文件为 Asset。

provider：`CSV_IMPORT` 或 `XLSX_IMPORT`。`source=IMPORT`。

下一步：Step 9.9D Desktop Assisted。不要自动进入。

