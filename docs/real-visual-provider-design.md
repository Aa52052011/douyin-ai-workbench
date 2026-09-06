# Real Visual Provider 架构设计（Step 7.1）

状态：**Step 7.2 Visual Stage Foundation = PASS。Step 7.3 Wanx adapter 已实现。默认测试零费用，未调用真实 Wanx HTTP。**

依据：2026-09-01 仓库代码核查（`apps/backend/src/media/**`、`videos/pipeline/**`、`jobs/**`、`workers/**`、Prisma `Asset` / `AssetLink` / `Job` / `Video`）以及：

- [video-generation-pipeline-implementation.md](./video-generation-pipeline-implementation.md)
- [real-media-provider-readiness-design.md](./real-media-provider-readiness-design.md)
- [real-tts-provider-design.md](./real-tts-provider-design.md)
- [ffmpeg-compose-implementation.md](./ffmpeg-compose-implementation.md)
- [minimax-tts-implementation.md](./minimax-tts-implementation.md)

文档与代码冲突时，**以代码为准**。本文件不是实现说明书。

调研截止 2026-09，只读公开文档，**没有** `fetch` 厂商 API。

---

## 1. Current State Audit

### 1.1 没有 VisualProvider 实现

`media-provider.types.ts` 里有一个**未接线**的 stub：

```ts
export interface ImageProvider {
  readonly id: string;
  generate(request: {
    prompt: string;
    storageKey: string;
    clientRequestId?: string;
  }): Promise<{
    storageKey: string;
    width: number;
    height: number;
    mimeType: string;
  }>;
}
```

仓库内 **零引用**（除类型定义本身）。没有 `IMAGE_PROVIDER` token。`MediaModule` 不注册任何 Image 实现。

`MockVideoProvider` **不是** Visual Provider。它实现 `VideoProvider.render()`，写入假 `video/mp4` 字节。Pipeline **不再调用它**。

当前 Visual 是 Stage 内联逻辑，不经过 Provider 接口。

### 1.2 COLOR_BACKGROUND 如何生成

`VisualGenerationStage.run`：

1. 若 `Job.output.stages.visual.assetIds` 全部 READY 且 `Storage.exists` → 整组复用。
2. 否则对 `ctx.plan.scenes` **顺序 for 循环**。
3. 每个 scene：`buildStorageKey` → `Storage.put(key, MIN_PNG, { mimeType: 'image/png' })`。
4. `MIN_PNG` 是 **1×1 透明 PNG**（`media.constants.ts`）。
5. **不读** `visualPrompt` / `visualSuggestion` / 颜色。画面由 FFmpeg `scale+pad` 放大成 1080×1920 色块。

没有真实绘图、没有 AI、没有 `clientRequestId`。

### 1.3 Scene 如何进入 Visual Stage

`VideosService.create` / `retry` 在 **HTTP 进程**调用 `buildProductionPlan`，结果写入 `Job.input.productionPlan`。Worker 只 `readPlan(job.input)`。

`pushScene`（代码）：

- `sceneId` = `deterministicUuid(videoId, v1:{sourceKind}:{sourceSectionSequence}:{sequence})`
- `visualSuggestion` = section 用 `section.visualSuggestion`；hook/opening/ending/cta 用 **整篇 `visualStyle`**
- `visualPrompt` = `` `${visualStyle} | ${visualSuggestion}` ``
- `visualSourceType` = **写死** `'COLOR_BACKGROUND'`
- 空 narration 的 scene **不入计划**

一个 Script 通常变成：hook + opening + N sections + ending + cta。Full Pipeline 验收为 **5 scenes → 5 IMAGE**。

### 1.4 一个 Scene 是否固定对应一个 Asset？

**是（当前实现）。** 循环一次创建一个 IMAGE Asset + 一条 `AssetLink`。Compose 要求 `visualIds.length === ctx.plan.scenes.length`，按下标对齐 `plan.scenes[i]`。

没有 scene 多图、没有共享一张图给多 scene。

### 1.5 Visual Asset 当前字段

| 字段 | 代码实际值 |
| --- | --- |
| `Asset.type` | `IMAGE` |
| `status` | `READY` |
| `mimeType` | `image/png` |
| `width` / `height` | `1` / `1` |
| `storageProvider` | `local` |
| `storageKey` | `v1/{tenant}/{workspace}/{project}/{assetId}/{objectId}` |
| `originalFilename` | `{sourceKind}.png`（`hook.png` 等） |
| `AssetLink.role` | **`VIDEO_SOURCE`** |
| `AssetLink.sortOrder` | `scene.sequence` |
| `AssetLink.videoId` / `jobId` | 都写 |

`metadata`（无 API Key、无完整 response）：

```
jobId, videoId, stage: 'visual', generationVersion,
sceneId, sourceSectionSequence, visualSourceType
```

没有 provider / model / prompt。

### 1.6 FFmpeg 如何消费 scene visual

`CompositionStage` 把 `stages.visual.assetIds[i].storageKey` 交给 `ComposeRequest.scenes[]`。

`FfmpegComposeProvider`：

1. 每个 scene materialize 到 **写死** `scene-00N.png`（**不管真实 MIME**）。
2. `-loop 1 -t {duration} -i {path}`。
3. scale：`force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2` → **contain + 黑边**。
4. concat → burn SRT → H.264 yuv420p + AAC。

语音 temp 已按 MIME 选扩展名；**图片没有同等处理**。JPEG 写成 `.png` 在部分 demuxer 上会失败。

### 1.7 Stage checkpoint 如何判断 Visual 完成

`VideoGenerationService.checkpoint('visual', { assetIds })` 写入：

```ts
output.stages.visual = {
  status: 'completed',
  assetIds: string[],
  completedAt: ISO,
  // provider / model 当前不传，为 undefined
}
```

`JobStageCheckpoint` **没有** `scenes[]`。完成条件 = 该对象存在且 `status === 'completed'`，再加 `reusableAssetIds` 全 READY。

**全部成功才 checkpoint。** scene 3/5 成功、4 失败 → 无 visual checkpoint → 重入会重做 1–5。

### 1.8 Worker crash 后是否复用 Asset？

**仅整组复用。** `reusableAssetIds`：数组里 **任何一个** 缺失 / 非 READY / Storage 不存在 → `null` → 全部重做。

同 Job stale RUNNING reclaim：有完整 checkpoint 才跳过 Visual。

用户 Retry：`VideosService.retry` **新建 Job**，`input.retryOf` 指向旧 Job，**不复制** `output.stages`。新 Job 的 Visual 从零开始。旧 `VIDEO_SOURCE` 仍挂在同一 `videoId` 上，但 Stage **不查询它们**。FFmpeg 失败后再 Retry **会重新生成全部图片**（对未来付费 Visual 不可接受）。

### 1.9 `clientRequestId`

Visual Stage：**没有。**

Voice：`${job.id}:voice:${generationVersion}`  
Compose：`${job.id}:compose:${generationVersion}`  
Subtitle：`${job.id}:subtitle:${generationVersion}`

### 1.10 `Job.output.stages.visual` 当前结构

```ts
{
  status: 'completed' | 'failed',
  assetIds: string[],
  completedAt?: string,
  startedAt?: string,
  duration?: number,
  provider?: string,  // 当前不写
  model?: string,     // 当前不写
}
```

没有 `scenes[]`、`providerTask`、`clientRequestId`。

`usage.imageCount` 在 **Compose checkpoint** 才写成 `visualIds.length`，Visual checkpoint 本身不更新 imageCount。

### 1.11 ProductionPlan 已有 visual 字段（不要再发明一套平行模型）

```ts
export const VISUAL_SOURCE_TYPES = [
  'TEXT_TO_VIDEO', 'TEXT_TO_IMAGE', 'IMAGE_TO_VIDEO',
  'STOCK', 'USER_ASSET', 'GENERATED_IMAGE',
  'SOURCE_VIDEO', 'COLOR_BACKGROUND',
] as const;

ProductionScene = {
  sceneId, sequence, sourceKind, sourceSectionSequence,
  narration, subtitle,
  visualSuggestion, visualPrompt, visualSourceType,
  durationBudget, transition,
}
```

`visualPrompt` **已经在 Job 创建时冻结**。Worker **不得**再调 LLM 改 prompt。

`fingerprintPlan` **不含** `visualPrompt` / `visualSourceType`（只 hash 旁白、voice.style、时长、画幅）。实现阶段应补上。

### 1.12 其它基线

- Job SoT：`PENDING | RUNNING | COMPLETED | FAILED | CANCELLED`。Crash = stale RUNNING reclaim。用户 Retry = **新 Job**。
- BullMQ payload 只有 `{ jobId }`。
- Storage 权威是 `storageKey`。`getUrl` 是 `local://...`，不是 CDN。
- MIME allowlist 已含 `image/png` `image/jpeg` `image/webp`。
- Worker 包只 `import backend dist/worker`。视觉实现仍放 `apps/backend`。
- `ErrorCode` 已有一组 `TTS_PROVIDER_*`。尚无 `VISUAL_PROVIDER_*`。

---

## 2. Goals / Non-goals

### Goals

- 可扩展 Visual：`COLOR_BACKGROUND` / `TEXT_TO_IMAGE`（AI 图）/ 未来 `TEXT_TO_VIDEO` / `USER_ASSET` / `STOCK`。
- **V1 只做真实 AI IMAGE**，把图送进现有 FFmpeg → Finalize 闭环。
- Prompt 在 Job 创建时冻结（ProductionPlan）。
- Scene 级 checkpoint：3/5 成功后 crash 不得重做 1–3。
- 付费调用：`clientRequestId` + SUBMITTING / UNKNOWN_BILLING。
- 默认测试零费用。真实调用必须 opt-in、单 scene、禁止自动 retry。

### Non-goals（本设计与后续 V1 实现）

- 不实现 AI_VIDEO / 即梦视频 / wan t2v。
- 不新增 VisualPlanning Agent。
- 不改 ScriptOutput 稳定合同。
- 不改 Auth / Workspace / Project / Agent Engine / Router One / 三个业务 Agent。
- 不改 MiniMax TTS / Subtitle 合同 / `finalizeJob`。
- 不把 Movie Editing 放进 ImageProvider。
- 不建 `ProviderTask` 表、不加 Job 列。
- 不改 Prisma enum（继续用 `VIDEO_SOURCE`）。
- 不做 UI、不做抖音发布。
- 不自动 fallback 到另一家视觉厂商或回退 COLOR_BACKGROUND（用户会以为是 AI 图）。

概念名 `AI_IMAGE` / `ASSET_LIBRARY` **映射到已有** `TEXT_TO_IMAGE` / `STOCK`，不新增 TS union 成员，除非实现时发现现有枚举语义冲突。

---

## 3. ProductionPlan changes

### 3.1 最小改动：保留 `ProductionScene` 扁平字段

不要再套一层 `scene.visual = { type, prompt, ... }`（与现有 `visualPrompt` + `visualSourceType` 重复，Job JSON 双写）。

V1 只扩展**可选**字段：

```ts
export type ProductionScene = {
  // 现有字段全部保留
  sceneId: string;
  sequence: number;
  sourceKind: SceneSourceKind;
  sourceSectionSequence: number;
  narration: string;
  subtitle: string;
  visualSuggestion: string;
  visualPrompt: string;          // provider-neutral 正向 prompt（冻结）
  visualSourceType: VisualSourceType;
  durationBudget: number;
  transition: 'cut' | 'fade';
  // V1 新增，可选
  visualNegativePrompt?: string; // 默认空；不进 Script contract
};
```

画幅仍在 **plan 级**：`aspectRatio` `resolution` `fps`。不要每 scene 复制一套，除非未来混 16:9/9:16。

### 3.2 `visualSourceType` V1 取值

| 运行模式 | `visualSourceType` | 费用 |
| --- | --- | --- |
| 默认 / 测试 | `COLOR_BACKGROUND` | 无 |
| `MEDIA_VISUAL_PROVIDER=wanx`（等）且非 test | `TEXT_TO_IMAGE` | 有 |

**在 `buildProductionPlan` 时写入**，随 Job.input 冻结。Worker 不根据 env 改 type（避免 reclaim 时 env 变了行为漂）。

env 只在 **创建 Job 的 API 进程**读取。Worker 只执行 plan。

### 3.3 Visual Prompt 放哪？推荐 **B**

| 选项 | 结论 |
| --- | --- |
| A. Script Agent 输出时生成 | 否。会改 ScriptOutput 或把厂商 prompt 写进脚本。 |
| **B. ProductionPlan Builder** | **V1 推荐。** Job 创建时冻结；无新 Agent；可用 `visualStyle` + `visualSuggestion` + narration。 |
| C. Worker Visual Stage 临时生成 | **禁止。** 半路 LLM、不可复现、crash 双花。 |
| D. 独立 Visual Planning Agent | V1 不需要。理由不充分。 |

Builder 内调用纯函数 `buildVisualPrompt`（无 I/O、无 LLM）。

### 3.4 fingerprint

`generationVersion` 必须纳入：`visualSourceType`、每 scene `visualPrompt`、`visualNegativePrompt`、`visualStyle` 来源字符串。否则换 visual 模式仍撞上旧 TTS fingerprint，Retry 误复用图。

---

## 4. VisualPrompt contract

Provider-neutral。禁止 `wanxSize` / `minimaxAspectRatio` 进入 Plan。

```ts
export type VisualPrompt = {
  sceneId: string;
  sequence: number;
  sourceKind: SceneSourceKind;
  prompt: string;              // 中文正向，已 trim
  negativePrompt?: string;
  style?: string;              // 来自 Script.visualStyle 或 POST /videos.visualStyle
  aspectRatio: string;         // 如 '9:16'
  language: 'zh-CN';
};

export function buildVisualPrompt(input: {
  scene: Pick<ProductionScene, 'sceneId' | 'sequence' | 'sourceKind' | 'narration' | 'visualSuggestion'>;
  visualStyle: string;
  aspectRatio: string;
  negativePrompt?: string;
}): VisualPrompt;
```

`ProductionScene.visualPrompt` = `VisualPrompt.prompt` 字符串（继续存在，Compose/日志不用二次拼）。完整结构可只在 Builder 内存中使用，或按需写入 plan（V1 用字符串足够，因 style/aspectRatio 已在 plan 根上）。

### 中文 vs 英文

- **权威 prompt = 中文。** 脚本、visualSuggestion、抖音语境都是中文。
- 推荐 Primary（万相）与 Backup（MiniMax Image）均宣称中文可用。
- **禁止**在 Provider 内偷偷调 LLM 翻译或 `prompt_extend`。
- 若某 Backup 只吃英文：在 **该 adapter** 用**确定性**模板前缀（如 `Vertical 9:16 still, no text overlay. Scene: ${zhPrompt}`），仍保存中文 `visualPrompt` 在 Plan。不要为翻译新开 Agent。

V1 模板（示意，实现可微调，不得调用模型）：

```
竖屏 9:16 静帧，不要字幕、不要水印、不要UI。
风格：{visualStyle}
画面：{visualSuggestion}
内容要点：{narration 截断到 N 字}
```

`negativePrompt` V1 默认：`字幕, 水印, 二维码, 变形手指, 文字, logo`（可配置，非 Script 字段）。

---

## 5. Provider interface

### 推荐：扩展现有 `ImageProvider.generate()`，不要新 `VisualProvider`

| 方案 | 结论 |
| --- | --- |
| `VisualProvider.generateImage()` | 与已有 `ImageProvider` 重复；V1 只有图。 |
| **`ImageProvider.generate()`** | **采用。** stub 已存在；对齐 TTS `synthesize`。 |
| `VisualProvider.generate()` 多态图/视频 | V1 过度抽象。AI_VIDEO 将来用独立 `ImageToVideoProvider` / 扩展 capabilities，不塞进 Movie Editing。 |

```ts
export type ImageGenerateRequest = {
  prompt: string;
  storageKey: string;
  clientRequestId: string;
  negativePrompt?: string;
  style?: string;
  aspectRatio?: string;
  width?: number;     // 可选 hint；adapter 映射厂商枚举
  height?: number;
  sceneId?: string;
};

export type ImageGenerateResult = {
  storageKey: string;
  width: number;
  height: number;
  mimeType: string;
  size: number;
  usage?: {
    provider: string;
    model?: string;
    providerTaskId?: string;
    providerDurationMs?: number;
  };
};

export interface ImageProvider {
  readonly id: string;
  readonly capabilities?: {
    image: true;
    async?: boolean;
    idempotency?: boolean;
  };
  generate(request: ImageGenerateRequest): Promise<ImageGenerateResult>;
  // 仅 async 厂商实现；V1 Primary 同步可不实现
  submit?(request: ImageGenerateRequest): Promise<{ providerTaskId: string }>;
  poll?(providerTaskId: string): Promise<
    | { status: 'running' }
    | { status: 'succeeded'; downloadUrl: string; mimeType?: string }
    | { status: 'failed'; code: string }
  >;
}
```

### 谁写 Storage？

与 TTS 相同：**Provider 下载/解码后 `Storage.put`，返回 `storageKey`。** 临时 URL 不得写入 Asset。URL 24h 过期（MiniMax 文档）必须立刻落地。

Stage 仍负责：Asset 行、AssetLink、checkpoint。Storage 成功而 Asset create 失败 → best-effort `storage.delete`（对齐 Voice）。

COLOR_BACKGROUND：`ColorBackgroundImageProvider` 实现同一 `ImageProvider`（本地 PNG，可仍用 `MIN_PNG` 或 1080×1920 纯色）。**零 HTTP。**

DI：`IMAGE_PROVIDER` token，仿 `TTS_PROVIDER`。`VisualGenerationStage` 只注入接口。

真实失败 **禁止** fallback Mock/色块。

---

## 6. Sync / Async design

JobStatus **不变**。厂商 queued/processing **只**存在于 `Job.output.stages.visual.scenes[].status`。

不建 ProviderTask 表。`providerTaskId` 可进 scene JSON（日志只打尾 6 位）。原则 **继续成立**。

```
NOT_STARTED → SUBMITTING → (sync: 直接 READY)
                          → SUBMITTED → POLLING → READY
                          → FAILED | UNKNOWN_BILLING
```

推荐实现名：`pending | submitting | submitted | polling | ready | failed | unknown_billing`。不要新增 Prisma enum。

### V1 Primary 选同步

通义万相 **wan2.6-t2i** 支持 HTTP **同步**（与 MiniMax TTS 同类：一次 POST 拿结果）。V1 `generate()` 内完成 HTTP + 下载 + `Storage.put`。Job 保持 `RUNNING`，heartbeat 继续。

### 异步兼容（不为 V1 实现，接口留口）

Worker **不**改成“Job COMPLETED 但还在等图”。仍占用同一 RUNNING Job：

1. scene → SUBMITTING（先落库）
2. `submit` → 写 `providerTaskId` SUBMITTED
3. `poll` 循环，受 `VISUAL_POLL_TIMEOUT_MS` 约束，每次 poll 检查 heartbeat
4. succeeded：下载 → Storage → Asset READY
5. 超时：Job FAILED，**不**自动第二发 submit

BullMQ 仍不是业务 SoT。不要 webhook 表。

同步 TTS 设计曾因单价低接受“不写 SUBMITTING”。**图片更贵，Visual 必须写 SUBMITTING。**

---

## 7. Paid-call idempotency

```
clientRequestId = `{jobId}:visual:{sceneId}:{generationVersion}`
```

同 Job reclaim 稳定。用户 Retry 是 **新 jobId** → 新 key（见 §9 用 AssetLink 复用，避免重付）。

| 厂商能力 | 做法 |
| --- | --- |
| **1. 支持 idempotency / 等价 request_id** | 每次 submit 带同一 `clientRequestId`。crash 后可安全重放。 |
| **2. 无幂等，但可用 taskId / 业务 id 查询** | SUBMITTING 丢失且无 taskId → **不准**再 submit。有 taskId → poll，不新开任务。 |
| **3. 两者都无** | SUBMITTING 且无确认回包 → **UNKNOWN_BILLING**，Job FAILED，**禁止自动 resubmit**。人工看账单后再决定是否新 Job。 |

**UNKNOWN_BILLING 原则对 Visual 继续适用，且比 TTS 更硬。** 不得为了“把页面跑绿”而第二次付费。

`X-Client-Request-Id` 若厂商只当日志关联、不计费去重：仍传，但按 **3** 处理丢失回包。

BullMQ `attempts: 3` 会重入整条 Pipeline。Visual 必须靠 scene checkpoint 跳过已 READY。**SUBMITTING 无 taskId 时，技术 retry 也禁止再 HTTP。** 应立即 FAILED，而不是再 attempts。

---

## 8. Scene checkpoint

```ts
type VisualSceneCheckpoint = {
  sceneId: string;
  sequence: number;
  assetId?: string;
  status: 'pending' | 'submitting' | 'submitted' | 'polling' | 'ready' | 'failed' | 'unknown_billing';
  clientRequestId: string;
  providerTaskId?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  errorCode?: string; // 短 code，无厂商 JSON
};

type VisualStageCheckpoint = JobStageCheckpoint & {
  provider?: string;
  model?: string;
  scenes: VisualSceneCheckpoint[];
};
```

兼容：`assetIds` **仍按 `plan.scenes` 顺序**填满，Compose 不改契约。`scenes[]` 是付费恢复的权威。

**每完成 1 个 scene 就 `mergeOutput`。** 不要等 5 张全完。

`VISUAL_MAX_CONCURRENCY` 默认 **1**。可配 2。禁止默认=scene 数。

部分成功：scene 4 失败 → Job FAILED；1–3 READY 保留。同 Job reclaim：跳过 1–3，**不得**自动重试 4（若 4 是 UNKNOWN_BILLING / 审核拒绝 / 401）。仅明确的未达厂商（连接失败且确认未 SUBMITTING）可由 BullMQ 有限重试。

---

## 9. Concurrency, cost, user Retry

默认串行。内存：同时只持有 1 张图的 Buffer。

用户手动 Retry（新 Job，同一 `videoId`）：

1. 若 `generationVersion` 相同：按 `sceneId` 查找已有 `AssetLink.role=VIDEO_SOURCE` 且 Asset READY + Storage.exists + `metadata.generationVersion` 匹配 → **复用，零 HTTP**。
2. 写入新 Job 的 `stages.visual.scenes[]` / `assetIds`（可新建指向同一 assetId 的 Link，或复用旧 Link；实现选一种，禁止复制文件）。
3. `generationVersion` 不同 → 全部新生成。

这是 FFmpeg 失败后不重复买图的关键。当前代码没有这一步，V1 必须做。

---

## 10. Asset strategy

继续：`type=IMAGE` `status=READY` `storageKey` 权威。

metadata 允许：

```
jobId, videoId, stage, generationVersion,
sceneId, sequence, visualSourceType,
provider, model, width, height,
promptHash,          // sha256(visualPrompt).slice(0,16)
providerTaskId       // 可选；日志脱敏
```

禁止：API Key、Authorization、完整 prompt 原文、完整厂商 JSON、未过期 signed URL。

**完整 prompt 不要进 Asset.metadata。** `Job.input.productionPlan.scenes[].visualPrompt` 已是 snapshot，够 debug / 复现。Asset 只留 hash。减少素材库 API 泄露旁白。

---

## 11. AssetLinkRole

**继续 `VIDEO_SOURCE`。** `sortOrder = scene.sequence`。已表达“成片用的视觉素材”。

不新增 `VIDEO_VISUAL` / `SCENE_VISUAL`（要 migration）。Movie 角色保持不动。

---

## 12. Image size / Douyin framing

**不要求**厂商输出精确 1080×1920。

| 层 | 职责 |
| --- | --- |
| Provider native | 9:16 最接近档，如万相 `960*1696`、MiniMax `9:16`（720×1280） |
| FFmpeg | 映射到 `plan.resolution`（默认 1080×1920） |

当前 filter 是 **contain + pad（黑边）**。抖音 V1 改为 **cover + crop**：

```
scale=W:H:force_original_aspect_ratio=increase,crop=W:H,setsar=1,fps=F
```

1×1 COLOR_BACKGROUND 用 cover 仍铺满，行为可接受。

这是对 `ffmpeg-args.ts` 的**允许的小改动**（实现阶段），不改 Finalize、不改 TTS。

---

## 13. Image normalization / FFmpeg

| MIME | V1 |
| --- | --- |
| `image/png` | 必须 |
| `image/jpeg` | 必须 |
| `image/webp` | **暂不作为必须**；收到则拒绝或一次性 ffmpeg 转 PNG（实现二选一，默认拒绝更简单） |

**不要**在 Storage 前统一转 PNG（浪费 CPU、无益于权威存储）。

FFmpeg materialize：**按魔数选扩展名**（对齐 voice），禁止写死 `.png`。

- PNG：`89 50 4E 47`
- JPEG：`FF D8 FF`

校验 MIME 与魔数一致，否则 `VISUAL_PROVIDER_INVALID_RESPONSE`，不写 READY。

Orientation：V1 不读 EXIF 旋转；cover crop 可接受。Alpha：PNG 进 yuv420p 由 FFmpeg 处理。Windows + FFmpeg 9：jpeg/png 足够。

---

## 14. Provider comparison（调研，未调用）

面向：中国大陆开发、人民币、中文 prompt、抖音 9:16、商用 API、接入复杂度、成本。

| 候选 | 区域/支付 | 中文 prompt | 9:16 | 同步 | 接入 | 成本量级 | 商用/稳定性 | V1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **通义万相 wan2.6-t2i**（百炼 DashScope） | 国内 / CNY | 原生 | 文档含 9:16 `960*1696` | **HTTP 同步**（2.6）；旧版异步 | Bearer REST，与现有 fetch 风格一致 | 约 **0.2 元/张**；开通有试用张数 | 阿里云 SLA、文档完整 | **Primary** |
| **MiniMax `image-01`** | 国内站已有账号 | 支持 | `9:16`→720×1280 | 同步 POST `/v1/image_generation` | 与 TTS 同站，但 **必须独立 Key 配置项** | 公开资料约分/张量级；URL **24h 过期** | 已有 TTS 运维经验；图像质量另评 | **Backup** |
| 火山即梦（Seedream / 文生图 4.x） | 国内 / 火山账单 | 强 | 支持 | 多为任务提交+轮询；AK/SK 签名 | 比 Bearer 重 | 按张；促销常见 | 抖音同源观感好 | 异步+签名，不作 V1 Primary |
| OpenAI `gpt-image-2` | 国际 USD；国内直连差 | 英文更稳 | 1024×1536 档 | 同步 Images API | 简单，但网络/支付差 | 约 $0.03–0.20/张 | 1.5 等 ID **2026-12 下线**；不要绑过期模型 | 不选 |
| Google Imagen / Gemini image | 国际 / Vertex | 英为主 | 有 | 视产品 | GCP 账号 | 按张 | 国内可达性差 | 不选 |
| Stability | 国际 | 英为主 | 有 | 同步/异步视型号 | REST | 信用卡 | 国内支付/合规一般 | 不选 |

**不因为已经用了 MiniMax TTS 就默认 MiniMax Image。** Primary 选万相：中文、同步、9:16、人民币、文档、单价清晰。Backup 选 MiniMax Image：同一中国区控制台、同步、便于 TTS 之后的运维兜底；**配置键必须分开**，禁止读取 `MINIMAX_TTS_API_KEY`。

万相 `prompt_extend`：**V1 必须关闭**。那是厂商侧 LLM 改写，违反“Provider 内不偷调 LLM”。

`n`：**恒为 1**。文档默认 4 会 ×4 计费。

---

## 15. Config

独立视觉配置。**禁止**默认读取 `MODEL_API_KEY` / `MINIMAX_TTS_API_KEY` / `TTS_API_KEY`。

```
MEDIA_VISUAL_PROVIDER=mock          # mock | wanx | minimax-image
# 测试：NODE_ENV=test 且 RUN_REAL_VISUAL_TESTS≠true → 强制 mock

# Primary：通义万相
VISUAL_WANX_API_KEY=
VISUAL_WANX_BASE_URL=https://dashscope.aliyuncs.com/api/v1
VISUAL_WANX_MODEL=wan2.6-t2i
VISUAL_WANX_SIZE=960*1696           # adapter 内映射 9:16；不进 Plan

# Backup：MiniMax Image（独立，不复用 TTS Key）
VISUAL_MINIMAX_API_KEY=
VISUAL_MINIMAX_BASE_URL=https://api.minimaxi.com/v1
VISUAL_MINIMAX_MODEL=image-01
VISUAL_MINIMAX_ASPECT_RATIO=9:16

VISUAL_TIMEOUT_MS=120000
VISUAL_MAX_RESPONSE_BYTES=15728640
VISUAL_MAX_CONCURRENCY=1
VISUAL_POLL_TIMEOUT_MS=180000       # 仅异步路径
RUN_REAL_VISUAL_TESTS=false
```

Secrets 只进 `visual/*-config.ts` + Provider。Job/Asset/日志禁止出现 Key。

`MEDIA_VISUAL_PROVIDER=mock`（默认）= 当前 COLOR_BACKGROUND 路径，测试与本地零费用。

---

## 16. Error model

实现阶段建议 `ErrorCode`（无 Schema 变更），镜像 TTS：

`VISUAL_PROVIDER_NOT_CONFIGURED` `AUTH` `RATE_LIMIT` `QUOTA` `INVALID_INPUT` `CONTENT_REJECTED` `TIMEOUT` `UNAVAILABLE` `INVALID_RESPONSE` `UNKNOWN_BILLING`

Public `Job.error` 只有 `{ code, message }`。禁止厂商 body。

日志允许：`provider` `model` `clientRequestId` `sceneId` `httpStatus` `latencyMs` `bytes`。禁止 prompt 全文、图 base64、Authorization。

---

## 17. Testing

| 层 | 何时跑 | 费用 |
| --- | --- | --- |
| Unit：prompt builder、idempotency key、checkpoint merge、MIME 魔数 | `npm test` | 0 |
| Mock integration：COLOR_BACKGROUND + scene 部分失败复用 | `npm test` / e2e | 0 |
| Opt-in 真实：`RUN_REAL_VISUAL_TESTS=true` | 显式命令 | **1 scene、1 request、禁止 retry** |
| Full pipeline real visual | 用户明确验收步骤 | 1 张图 + 已有 TTS/FFmpeg 策略另议 |

`NODE_ENV=test` 未 opt-in → `resolveVisualProviderId() === 'mock'`，即使 env 写了 `wanx`。

禁止普通 `npm test` / `test:e2e` 触达百炼/MiniMax Image。

---

## 18. Failure recovery matrix

| # | 场景 | 复用 Asset | 再收费 | 自动 retry | Job |
| --- | --- | --- | --- | --- | --- |
| 1 | HTTP 失败，确认未 accept | 已有 READY scene 复用 | 否 | 有限次网络类 | 耗尽则 FAILED |
| 2 | 已 accept，回包丢失 | 否（无 READY） | **否** | **否** | FAILED `UNKNOWN_BILLING` |
| 3 | 异步 task failed | 其它 READY scene | 否 | 否（业务失败） | FAILED |
| 4 | 图已下载，`Storage.put` 失败 | 否 | 若无幂等，按 SUBMITTING 规则 | 有幂等才可重放同一 key | 可能 FAILED |
| 5 | Storage 成功，Asset create 失败 | 删 orphan 文件；无 READY | 有幂等可重放；否则 UNKNOWN 风险 | 谨慎 | FAILED 或 reclaim 后按 7 |
| 6 | Asset READY，checkpoint 未写 | **按 videoId+sceneId+generationVersion 扫描 VIDEO_SOURCE** 补 checkpoint | 否 | reclaim 时补齐 | 继续 |
| 7 | crash 在 scene 3/5 READY 之后 | 1–3 复用 | 只生成未 READY | 未 SUBMITTING 的后续 scene | RUNNING reclaim |
| 8 | 全部 Visual 完成，FFmpeg 失败 | **全部 Visual 复用** | 否 | Compose 可技术 retry；Visual 跳过 | Compose 失败则 Job FAILED；用户 Retry 仍复用图 |
| 9 | 用户手动 Retry Video | 同 generationVersion 的 VIDEO_SOURCE | 否 | 新 Job，但 Visual 跳过已有图 | 新 Job PENDING→… |

用户 Retry 在 COMPLETED+outputAssetId 时仍 `VIDEO_CONFLICT`（现有代码）。不改该规则。

---

## 19. Migration impact

| 项 | V1 |
| --- | --- |
| Prisma schema / 新 migration | **无** |
| `AssetLinkRole` | 不改 |
| JobStatus | 不改 |
| `Job.output` JSON | 扩展 `stages.visual.scenes[]`（兼容旧只有 `assetIds`） |
| ScriptOutput | **不改** |
| Auth / Agents / TTS / Subtitle / Finalize | **不改** |
| FFmpeg args | 允许：图片扩展名 + cover crop |
| ProductionPlan | 可选 `visualNegativePrompt`；builder 可写 `TEXT_TO_IMAGE`；fingerprint 补 visual |
| MediaModule | 新增 IMAGE_PROVIDER |

Movie Editing：继续 `SOURCE_VIDEO` / `MOVIE_*`。ImageProvider **不是**剪辑主链路。共享 Asset / Storage / Job / FFmpeg 即可。

---

## 20. Implementation plan（待用户批准后才开工）

不要在本 Step 写代码。建议顺序：

1. **Step 7.2 Mock ImageProvider + scene checkpoint**（零费用）  
   `ColorBackgroundImageProvider`、token、Visual Stage 注入、每 scene `mergeOutput`、Retry 复用 `VIDEO_SOURCE`、FFmpeg 按魔数扩展名 + cover。默认仍 mock。单测覆盖 3/5 crash。
2. **Step 7.3 Wanxiang adapter**  
   同步 `generate`、独立 env、`prompt_extend=false`、`n=1`、下载后 Storage。opt-in 测试。
3. **Step 7.4 单 scene 真实验收**  
   exactly 1 张图，禁止 retry，再接入现有 TTS+FFmpeg 仅当用户明确要求。
4. MiniMax Image adapter 仅作 Backup，不与 7.3 并行作为默认。

---

## 附录：稳定模块冻结清单

不修改：Auth、Workspace、Project、Agent Engine、Router One、Account Positioning / Content Planning / Script Agent 稳定输出、MiniMax TTS、Subtitle 合同、`finalizeJob`。

ScriptOutput 保持：

`title hook opening sections[] ending cta totalDuration estimatedWordCount voiceStyle visualStyle productionNotes[]`

`sections[].visualSuggestion` 保留，不替换。

---

## 21. Step 7.3 Wanx concrete adapter

状态：已实现。**未发送真实 Wanx 请求。** 默认 `MEDIA_IMAGE_PROVIDER=color-background`。普通 unit / e2e 在 `NODE_ENV=test` 且 `RUN_REAL_VISUAL_TESTS≠true` 时强制本地色块。

依据：[通义万相文生图 API 参考](https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference)（北京区，wan2.6-t2i HTTP 同步）。

### Endpoint / Key

- 地域：**华北2（北京）**。API Key 与 Endpoint **必须同地域**，不可把新加坡/弗吉尼亚 Key 打到北京域名。
- 官方推荐业务空间专属域名：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1`
- 配置项是完整 **`WANX_BASE_URL`**（含 `/api/v1`）。代码不拼接、不硬编码 WorkspaceId。
- 同步 V1：`POST {WANX_BASE_URL}/services/aigc/multimodal-generation/generation`
- **不要**加 `X-DashScope-Async`（那是异步接口）。
- Auth：`Authorization: Bearer {WANX_API_KEY}`。禁止复用 `MODEL_API_KEY` / `MINIMAX_TTS_API_KEY` / `VISUAL_MINIMAX_API_KEY`。

### Request mapping（V1）

| 字段 | 值 |
| --- | --- |
| model | `WANX_MODEL` 默认 `wan2.6-t2i` |
| prompt | ProductionPlan 已冻结的中文/混合 `visualPrompt`，不翻译、不走 LLM |
| negative_prompt | 可选；官方支持，最长 500 |
| n | **恒为 1**（官方默认 4，按张计费） |
| prompt_extend | **恒为 false**（官方默认 true；冻结 prompt 禁止厂商改写） |
| size | 官方 9:16 推荐 **`960*1696`**。不是 1080×1920。Compose 仍 cover crop 到成片分辨率 |
| watermark | false |

`clientRequestId` 只做 Job/scene 关联。官方同步接口 **没有** idempotency header / client token。

```
supportsIdempotency = false
supportsTaskLookup = false
```

同步成功响应没有 `task_id`。`request_id` 只是 correlation，**不是**计费幂等键，也不是可查询任务 id。丢回包 **禁止**再 POST。

### Response / storage authority

- 图片在 `output.choices[].message.content[].image`，官方 PNG，URL **约 24h 过期**。
- URL 只是临时 transport。必须 download → magic 校验 PNG/JPEG → `Storage.put`。
- **Asset.storageKey 才是权威地址。** 禁止把厂商 URL / signed URL 写入 Asset 或 Job.output。
- `usage.image_count` 映射到 `ImageUsage.imageCount` / `Job.output.usage.visual`。不在代码里算价格。

### Paid-call safety

1. HTTP **之前** checkpoint：`status=submitting` + `clientRequestId` + `provider=wanx` + `model` + `submittedAt`。
2. Generation **POST retry = 0**。
3. 图片 GET 可有限 retry（不再产生生图费用）；GET **不带** Wanx Authorization。
4. 连接前失败（缺配置、空 prompt）→ scene `failed`。
5. POST 可能已到达但回包丢失（timeout、5xx、200 无图、malformed JSON）→ scene **`unknown_billing`**，Job FAILED，**禁止自动 resubmit**。
6. 同 Job 再入：`unknown_billing` 或 wanx `submitting` 且无 READY Asset → 直接 `VISUAL_PROVIDER_UNKNOWN_BILLING`，不再 generate。
7. 本地 `color-background` 的 submitting 仍可重做（零费用）。

### Errors

公开码：`VISUAL_PROVIDER_NOT_CONFIGURED` `AUTH` `RATE_LIMIT` `QUOTA` `BAD_REQUEST` `TIMEOUT` `INVALID_RESPONSE` `DOWNLOAD` `UNKNOWN_BILLING`。

禁止把 vendor raw body / Authorization / API Key 返回前端。日志可保留 HTTP status、sanitized vendor code、`request_id`。

### Tests

- `wanx-image.provider.spec.ts`：全部 mock fetch，零真实 HTTP。
- `wanx-image.integration.spec.ts`：默认 skip。只有 `RUN_REAL_VISUAL_TESTS=true` 且 `MEDIA_IMAGE_PROVIDER=wanx` 且配置完整才允许 **exactly 1** 张图。Step 7.3 **不执行**。

