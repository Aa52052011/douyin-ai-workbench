# Real TTS Provider 选型与接入设计（Step 6.6）

状态：**设计已落地 openai-tts（Step 6.7）与 MiniMax 同步 TTS（Step 6.7-M，`minimax-tts`）。** 未实现 ProviderRouter / 真实 Image/Video。实现说明见 [openai-compatible-tts-implementation.md](./openai-compatible-tts-implementation.md)、[minimax-tts-implementation.md](./minimax-tts-implementation.md)。

依据：2026-08-31 仓库代码核查（`apps/backend/src/media/**`、`videos/pipeline/**`、`jobs/**`、`workers/**`）以及：

- [video-generation-pipeline-design.md](./video-generation-pipeline-design.md)
- [video-generation-pipeline-implementation.md](./video-generation-pipeline-implementation.md)
- [real-media-provider-readiness-design.md](./real-media-provider-readiness-design.md)
- [video-finalization-consistency-implementation.md](./video-finalization-consistency-implementation.md)
- [ffmpeg-compose-implementation.md](./ffmpeg-compose-implementation.md)
- [job-queue-worker.md](./job-queue-worker.md)
- [architecture.md](./architecture.md)
- [development.md](./development.md)

文档与代码冲突时，**以代码为准**。

Step 6.6 只出设计，不改业务代码。Step 6.7 已按该设计落地第一家同步 TTS。下列 **§1 是 6.7 之前的代码审计快照**，不要当作当前实现。

6.7 落地后（以代码为准）：

- `TTS_PROVIDER` token；`MEDIA_TTS_PROVIDER=mock|openai-tts`；测试未 opt-in 强制 Mock
- `VoiceGenerationStage` 只注入 `TtsProvider`；`originalFilename` 按 mime（`voice.mp3` / `voice.wav`）
- FFmpeg temp 按 mime/魔数 materialize，不再写死 `voice.wav`
- Storage.put 成功而 Asset create 失败时 best-effort `storage.delete`
- `X-Client-Request-Id` 是关联 ID，不是厂商计费幂等
- 已知 crash 窗口仍存在（扣费后、checkpoint 前崩溃可能再扣一次）

---

## 1. Current TTS implementation audit（6.7 之前快照）

### 1.1 `TtsProvider` 实际合同（代码）

```ts
interface TtsProvider {
  readonly id: string;
  synthesize(request: {
    text: string;
    storageKey: string;
    voice?: string;
    language?: string;
    speed?: number;
    clientRequestId?: string;
  }): Promise<{
    storageKey: string;
    duration: number;
    mimeType: string;
    size: number;
  }>;
}
```

没有：`format`、`usage`、`timestamps`、`capabilities`。没有命名的 Request/Result 类型。

`MockTtsProvider.id = 'mock-tts'`。输入 `voice` / `language` / `speed` / `clientRequestId` **已接收但 Mock 不映射厂商 ID**。`speed` 只影响字符估时。失败哨兵：文本含 `__mock_fail_voice__` → `VIDEO_PROVIDER_FAILED`。

输出：`Storage.put` 合法静音 WAV（44.1kHz / 16-bit / mono PCM），`mimeType = audio/wav`。`duration = max(1, ceil(去空白字数 / (8 * speed)))`。

### 1.2 VoiceGenerationStage（代码）

- 直接注入 **具体类** `MockTtsProvider`，**没有** `TTS_PROVIDER` token（Compose 已有 `COMPOSE_PROVIDER`）。
- 幂等：`Job.output.stages.voice.assetIds` + Asset `READY` + `deletedAt=null` + `Storage.exists`。
- `clientRequestId = `${job.id}:voice:${generationVersion}``。
- 请求：`text = plan.voice.text`，`voice = plan.voice.style`，`language = plan.voice.language`，`speed = plan.voice.speed`。
- Asset：`AUDIO` / `READY` / `originalFilename: 'voice.wav'`（**写死**）/ `mimeType` 来自 Provider。
- metadata：`jobId` `videoId` `stage` `generationVersion`。无 provider / model。
- `AssetLink.role = VIDEO_AUDIO`。
- Storage 成功、Asset create 失败时：**没有** Compose 那种 best-effort `storage.delete`。
- 业务层无 `if provider === ...`，也无厂商 endpoint；但 DI 绑死 Mock，切换不了真实实现。

### 1.3 ProductionPlan.voice（代码）

```ts
voice: {
  style: string;      // config.voiceStyle || Script.voiceStyle || 'default'
  language: 'zh-CN';  // 写死
  speed: 1;           // 写死
  text: string;       // hook+opening+sections.narration+ending+cta，trim 后 \n 拼接
}
```

`Script.voiceStyle` 是 **自由中文字符串**（fixture：`冷静、中速、不鸡血`），不是 enum。Prompt 未约束 preset。禁止改 `ScriptOutput.voiceStyle`。

### 1.4 下游

- Subtitle：`buildSubtitleCues(scenes, voiceDuration)` 按 `durationBudget` 缩放到 **真实 voice duration**。不需要 TTS timestamps。
- Compose：`FfmpegComposeProvider` 把 voice **materialize 为 temp `voice.wav`**（扩展名写死）。FFmpeg 按内容探测格式，MP3 写成 `.wav` 有失败风险。
- Orchestrator：checkpoint `audioCharacters: plan.voice.text.length`，`audioSeconds: voice.duration`。`estimatedCost` 恒为 `0`。
- Finalize：不读 TTS；`Video.duration` 来自 Compose/ffprobe。Step 6.7 **禁止改 Finalize**。
- Queue：payload **只有** `{ jobId }`。BullMQ `attempts: 3`，exponential backoff 1s。
- Crash recovery：仅 stale **RUNNING** reclaim。FAILED 不自动复活。
- HTTP 习惯：`RealModelProvider` 已用 **Node `fetch` + `AbortController`**。无 TTS SDK。

### 1.5 配置边界（现有）

Compose：`MEDIA_COMPOSE_PROVIDER=mock|ffmpeg`；`NODE_ENV=test` 且未 `RUN_FFMPEG_TESTS=true` → 强制 mock。

Chat 模型：`MODEL_API_KEY` / `MODEL_BASE_URL` / `MODEL_NAME`，由 `model.config.ts` 读取。**不得**把该 Key 当作 TTS 凭证默认复用（能力集不同；本设计不读取、不打印任何 Key）。

MIME 已允许 `audio/mpeg`（`.mp3`）与 `audio/wav`。

---

## 2. Stable pipeline（必须保持）

```
Script.payload
  → ProductionPlan
  → COLOR_BACKGROUND PNG
  → MockTtsProvider WAV          // 默认 / NODE_ENV=test
  → SRT（按 voice duration 缩放）
  → MockCompose 或 FfmpegCompose
  → H.264/AAC MP4
  → Asset VIDEO READY
  → finalizeJob
  → Video COMPLETED + Job COMPLETED + VIDEO_OUTPUT × 1
```

`MEDIA_TTS_PROVIDER=mock`（默认）**必须**继续这条路径。真实 TTS 失败 **禁止** 自动降级到 Mock（用户会以为是真配音，实际是静音 WAV）。

---

## 3. TtsProvider V1 合同

现有字段已覆盖：`text` `voice` `language` `speed` `clientRequestId`，以及 `storageKey` / `duration` / `mimeType` / `size`。

**建议 Step 6.7 做最小扩展（可选字段，Mock 可忽略）：**

```ts
type TtsSynthesizeRequest = {
  text: string;
  storageKey: string;
  voice?: string;            // provider-neutral preset，不是厂商 voice id
  language?: string;
  speed?: number;
  clientRequestId?: string;
};

type TtsUsage = {
  characters?: number;
  audioSeconds?: number;
  provider: string;
  model?: string;
  estimatedCost?: number;
  currency?: string;
};

type TtsSynthesizeResult = {
  storageKey: string;
  duration: number;
  mimeType: string;
  size: number;
  usage?: TtsUsage;
  timestamps?: Array<{ start: number; end: number; text: string }>;
};

interface TtsProvider {
  readonly id: string;
  readonly capabilities?: { tts: true; async: false };
  synthesize(request: TtsSynthesizeRequest): Promise<TtsSynthesizeResult>;
}
```

- `format` **不**进业务请求：放 Provider config（如 `TTS_AUDIO_FORMAT=mp3`）。
- `voice` 继续传 **preset**，厂商 ID 只在 adapter 内映射。
- `timestamps` 可选；首版不要求。
- `async: false`：第一家只做同步。不实现 `submit/poll`。

**不需要**为第一家推翻接口。命名类型 + 可选 `usage` 即可。

---

## 4. VoiceGenerationStage 边界

**Stage 负责：** 读 Plan、组 provider-neutral request、调 `TtsProvider`、建/复用 AUDIO Asset + `VIDEO_AUDIO`、checkpoint、幂等。

**Provider 负责：** 文本 → 音频 bytes → `Storage.put(storageKey)` → 返回 duration/mime/size。读 credential、拼厂商 URL、映射 voice、校验魔数、超时、把 HTTP 错误变成 AppError。

**禁止：** Stage / Controller / `VideoGenerationService` 出现 `if provider === 'openai'`、厂商 endpoint、厂商 model/voice id。

Step 6.7 必做：引入 `TTS_PROVIDER` token（仿 `COMPOSE_PROVIDER`），Stage 注入接口，不再绑 `MockTtsProvider` 类。

`originalFilename` / extension 必须跟 `mimeType` 与 bytes 一致（禁止 MP3 + `voice.wav`）。

Asset create 失败：best-effort `storage.delete`（与 Compose 对齐）。仍不建 orphan 表。

---

## 5. Provider 选择模型

不做 ProviderRegistry / Router / fallback chain / 成本路由。

```
MEDIA_TTS_PROVIDER=mock|<id>
```

选择逻辑（对齐 Compose）：

```
if NODE_ENV=test && RUN_REAL_TTS_TESTS !== 'true' → mock
else MEDIA_TTS_PROVIDER === '<id>' && credentials 齐全 → real
else mock
```

启动 Backend 且 `mock`：**不得**因未装 TTS Key / 未装 FFmpeg 失败。

Worker 读 TTS 配置；enqueue **不需要**知道 TTS binary 或 Key。

---

## 6. Credentials

| 允许 | 禁止 |
| --- | --- |
| Provider 构造 / `tts.config.ts` 读 env | `VoiceGenerationStage` 读 `process.env.VENDOR_API_KEY` |
| 平台环境变量（Step 6.7） | Job.input / Job.output / Asset.metadata / Queue / Frontend / 日志 |
| 未来用户自带 Key（V2+） | 把 `MODEL_API_KEY` 默认当作 TTS Key |

模式对齐 `readRealModelConfig()`：专用 `TTS_API_KEY` + `TTS_BASE_URL`。Chat 与 TTS 凭证分离。

Queue payload 仍只有 `{ jobId }`。

本设计 **不读取、不测试、不打印** 任何真实 Key。

---

## 7. Sync vs async

| 类型 | 形态 | 第一家 |
| --- | --- | --- |
| **A** | HTTP 同步，body = audio bytes | **优先** |
| **B** | HTTP 同步 JSON（base64 / hex） | 可接受 |
| **C** | submit → taskId → poll → URL | **不选第一家** |

推荐 A；B 需限制 JSON 大小再 decode。C 需要 delayed queue / providerTask，超出 6.7。

---

## 8. Audio formats

| 格式 | FFmpeg | 体积 | duration | 网络 | V1 |
| --- | --- | --- | --- | --- | --- |
| WAV PCM | 最好 | 大 | 头即可 | 差 | Mock 继续用 |
| **MP3** | 好 | 小 | 需探测 | 好 | **真实 TTS 默认** |
| AAC | 好 | 小 | 需探测 | 好 | 可存，非默认 |
| Opus | 好 | 很小 | 需探测 | 好 | 不作为 V1 默认 |

真实 TTS **不必**转成 WAV。允许 `audio/mpeg` Asset。Compose 按媒体解码，**不要为了统一格式强制转码**。

已知兼容点：`FfmpegComposeProvider` temp 文件名写死 `voice.wav`。Step 6.7 若走 MP3，**仅允许**按 mime 改 temp 扩展名（`voice.mp3`）。不改 filter/字幕 escaping/Finalize。

---

## 9. MIME validation

不能只信 `Content-Type`。

| 声明 | 魔数（至少） |
| --- | --- |
| `audio/wav` / `audio/wave` | `RIFF` @0 + `WAVE` @8 |
| `audio/mpeg` | `ID3` 或帧同步 `0xFF 0xE*` |

失败 → `ASSET_INVALID_FILE` 或 TTS `PROVIDER_INVALID_INPUT`，不写 READY Asset。mime、extension、bytes 必须一致。

---

## 10. Duration

Mock 的 `ceil(chars/8)` **禁止**作为真实 TTS 的成片时间轴。

权威顺序：

1. **本地探测已落地的音频**（WAV 头 / 有限 MP3 解析；若本机有 ffprobe 可用但不作为 Worker 硬依赖）
2. Provider 返回的 duration（若有且 > 0，与探测差过大时以探测为准）
3. **禁止**回退字数公式

`Subtitle` 继续用该 duration 做 proportional SRT。`Video.duration` 仍来自 Compose ffprobe，不是 TTS duration。

---

## 11. Timestamps

Step 6.7 **不需要**。现有 SRT 已按 voice duration + `durationBudget` 工作。

若 Provider 顺便返回 word/sentence timestamps：可写入非敏感 `Job.output.stages.voice`（不要完整旁白）。**不**为此重写 Subtitle Stage。

---

## 12. Voice mapping

```
Script.voiceStyle（自由文本，冻结）
  → ProductionPlan.voice.style（可被 POST /videos.voiceStyle 覆盖，不回写 Script）
  → Stage 传入 request.voice（仍是 style 字符串）
  → Adapter：normalizePreset(style) → vendorVoiceId
```

**禁止** `elevenlabsVoiceId` / `azureVoiceId` 进入 ProductionPlan。

V1 preset（adapter 内，不改 Script 合同）：

| preset | 从 style 启发式（小写/包含） |
| --- | --- |
| `calm` / `narration` | 冷静、平静、旁白、中速、不鸡血 |
| `energetic` | 活力、热情、激情、兴奋 |
| `male` | 男 |
| `female` | 女 |
| `default` | 其他 / 空 / `default` |

冲突时：显式男女优先，否则 narration/calm 优先于 energetic，再 default。

首选 Provider 的具体 voice id **只写在 adapter config**（可用 env 覆盖单个 default voice）。不要把映射表塞进 Plan。

---

## 13. Language

代码现状：Plan.language **恒为 `zh-CN`**。无检测。

V1：继续传 `zh-CN`。未来允许 `en-US` / `ja-JP` 等，由 Plan/config 提供，**不**改 ScriptOutput。第一家 Provider 必须中文可用。

---

## 14. Speed

代码现状：恒 `1`。Mock 公式用 `speed`。

V1 安全范围：**clamp 到 `[0.75, 1.5]`**（Plan 将来若可配）。当前恒 1，映射为厂商 `1.0`。

- 厂商支持 speed：映射。
- 不支持：**忽略**（不报错、**不**做 FFmpeg `atempo`）。

---

## 15. Text length

`SCRIPT_WORD_BUDGET`：15s 60–80 字 … 60s 240–300 字。Voice 文本另含 hook/opening/ending/cta，总量通常 **远低于 4096 字符**。

**Step 6.7 继续单次合成完整旁白。** 不做 sentence chunk DAG。超过 Provider 上限 → `PROVIDER_INVALID_INPUT`，Job FAILED（可提示缩短脚本），不静默截断。

---

## 16. Normalization（最小）

1. `trim`
2. 去掉 C0 控制字符（保留 `\n` `\t`）
3. 连续空白压成单个空格；连续换行压成单个 `\n`

禁止：LLM 改写、数字口语化、翻译。除非所选厂商文档强制要求（目前不作为 6.7 前置）。

---

## 17. Idempotency

继续传 `clientRequestId = {jobId}:voice:{generationVersion}`（同 Job reclaim 稳定，禁止每次 UUID）。

| 厂商能力 | 做法 |
| --- | --- |
| `Idempotency-Key` / `request_id` | 映射 clientRequestId |
| 仅追踪、不计费去重 | 仍传，作日志关联 |
| 完全不支持 | 见 §18 |

---

## 18. Crash window

```
TTS 已扣费并返回 bytes
  → Storage/Asset/checkpoint 之前 Worker crash
  → stale RUNNING reclaim
  → 再调 TTS
```

Stage checkpoint **不能**关闭此窗口。本阶段 **不加表**、不加 Outbox / ProviderTask。

| 方案 | Step 6.7 |
| --- | --- |
| A. 接受低成本同步 TTS 的重复扣费 | **推荐** |
| B. 调用前先写 SUBMITTING JSON | 不推荐（无表、无事务收益） |
| C. 要求厂商幂等 | 有则用，无则不否决廉价 API |
| D. 新表 | **禁止** |

Storage 成功、DB 失败：best-effort delete。仍可能有 orphan 文件：structured log key/hash，Public API 不暴露 storageKey。

---

## 19. HTTP

Step 6.7：**Node built-in `fetch` + `AbortController`**（与 `RealModelProvider` 一致）。

不安装 `openai` / Azure / MiniMax SDK，除非公开 HTTP 明显不足（当前候选均有 REST）。

响应：有限 buffer（见 §27）。不要把整个 JSON/base64 打进日志。

---

## 20. Timeout

独立于 FFmpeg。

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `TTS_TIMEOUT_MS` | `60000` | 同步 HTTP 总超时（AbortController） |

同步 API **不需要**单独的 submit/poll timeout。不要复用 `FFMPEG_TIMEOUT_MS`。

超时 → `PROVIDER_TIMEOUT`，sanitized；kill 的是 HTTP 而非 FFmpeg 子进程。

---

## 21. Retry

分类：

| 情况 | same Job 技术 retry | Job FAILED |
| --- | --- | --- |
| 连接失败 / 重置，请求可能未到达 | 是（BullMQ attempts） | 耗尽后 |
| HTTP 5xx | 是 | 耗尽后 |
| HTTP 429 | 有限次（用现有 attempts=3） | 耗尽后 |
| HTTP 408 / Abort timeout | 是 | 耗尽后 |
| HTTP 401 / 403 | **否** | 立即 |
| HTTP 400 参数 | **否** | 立即 |
| 内容审核拒绝 | **否** | 立即 |
| 配额用尽 | **否** | 立即 |

禁止：401 无限 retry；Worker 内 `while sleep` 占 lease。

注意：BullMQ retry 会重入 **整条** Pipeline。Visual 有 checkpoint 会跳过；Voice 仅在 checkpoint+READY+exists 时跳过。这正是 crash window 重复计费路径。

---

## 22. Rate limiting

若响应含 `Retry-After`：未来可映射为 delayed enqueue。Step 6.7：**不**实现 delayed queue；429 走有限 BullMQ retry。同步 TTS 预期秒级，保持简单。

不要把 429 的完整 body 写入 `Job.error`。

---

## 23. Error normalization

内部/日志可用细分 code；Public `Job.error` 只 `{ code, message }`。

建议 Step 6.7 增加 `ErrorCode`（无 Schema 变更）：

| code | 典型 HTTP |
| --- | --- |
| `PROVIDER_AUTH` | 401/403 |
| `PROVIDER_RATE_LIMIT` | 429 |
| `PROVIDER_QUOTA` | 402 / 配额文案 |
| `PROVIDER_INVALID_INPUT` | 400 |
| `PROVIDER_CONTENT_REJECTED` | 400/451 审核 |
| `PROVIDER_TIMEOUT` | abort |
| `PROVIDER_UNAVAILABLE` | 5xx / 网络 |

也可暂时全部映射为现有 `VIDEO_PROVIDER_FAILED`，message 用短 sanitized 句。**禁止**厂商完整 JSON 进 Job.error。

---

## 24. Logging

允许：`provider` `model` `clientRequestId` `httpStatus` `latencyMs` `usage` `audioBytes`。

禁止：`Authorization`、API Key、完整旁白、完整音频 / base64、完整 response、signed URL token。

---

## 25. Usage / cost

继续 `Job.output.usage`（已有 `audioCharacters` `audioSeconds` `estimatedCost`）。**不建 Usage 表。**

Step 6.7：

- `audioCharacters` = **实际送出**（normalization 后）字符数，不是估时公式
- `audioSeconds` = 探测 duration
- `estimatedCost` 若有公开单价可算；**明确 estimated ≠ 账单**
- `provider` / `model` 放 `stages.voice` 或 usage 扩展字段，不要硬编码财务逻辑

---

## 26. Storage

```
Provider HTTP
  → bytes（校验魔数）
  → StorageService.put
  → Asset AUDIO READY
```

禁止把厂商临时 URL 当 Video 音轨。Compose 只读 Storage abstraction。

---

## 27. Response size

`MEDIA_MAX_UPLOAD_BYTES = 32MiB`。TTS 再收紧：

| 上限 | 建议 |
| --- | --- |
| HTTP body / 解码后音频 | **8MiB** |
| 60s MP3 预期 | ≪ 1MiB |

超限：中断读取，`PROVIDER_INVALID_INPUT`，不落盘。V1 先 buffer，不强制 stream 落盘。

---

## 28. Asset metadata

允许：`jobId` `videoId` `stage` `generationVersion` `provider` `model` `voicePreset` `language` `duration`。

禁止：API key、完整 text、authorization、完整 provider response、temp path、storage root。

---

## 29. Config

通用（先设计名字；未选中的厂商 **不要** 写进 `.env.example`）：

```
MEDIA_TTS_PROVIDER=mock|openai-tts
TTS_TIMEOUT_MS=60000
TTS_AUDIO_FORMAT=mp3
RUN_REAL_TTS_TESTS=   # 未设则 skip
```

首选 Provider 锁定后再加（Step 6.7 才写入 example，值为空占位，不要提交真实 Key）：

```
TTS_API_KEY=
TTS_BASE_URL=https://api.openai.com/v1
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE_DEFAULT=alloy
```

`TTS_BASE_URL` 允许 OpenAI 或 **OpenAI-compatible** 网关。不要默认复用 `MODEL_BASE_URL`。

`NODE_ENV=test` 未 opt-in 时强制 mock，即使 `MEDIA_TTS_PROVIDER` 指向真实。

---

## 30. Tests

| 套件 | TTS |
| --- | --- |
| `npm test` / 普通 e2e | **必须 Mock**，零费用 |
| `RUN_REAL_TTS_TESTS=true` 且 Key+URL 存在 | 真实 integration |
| Key 缺失或未 opt-in | **skip**，不让 CI 扣费 |
| 真实请求文本 | 仅短句：`你好，这是测试。` |
| 断言 | HTTP 成功、bytes>0、魔数、duration>0、Storage、Asset mime/ext 一致 |
| Full pipeline opt-in | 短 Script + COLOR_BACKGROUND + Real TTS + SRT + FFmpeg + MP4；默认 skip |
| 禁止 | 打印 Authorization；60s 全文；自动 Real→Mock |

---

## 31. Candidate provider matrix

公开资料。不确定处标 **需人工确认**。本表 **不是**实现清单。

评分：● 强 / ○ 中 / △ 弱或复杂 / ? 需确认。权重：短视频中文旁白、同步 HTTP、个人开发、未来 SaaS，不是「最好听」单项。

| 维度 | OpenAI Speech | MiniMax T2A | Azure Speech | Google Cloud TTS | ElevenLabs | 火山/豆包 | 阿里云 | 腾讯云 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 中文自然度 | ○ | ● | ● | ○ | ○/? | ● | ● | ● |
| 多语言 | ● | ● | ● | ● | ● | ○ | ○ | ○ |
| 同步 API | ● **A** | ● **B**（JSON hex/base64） | ● A/B | ● **B** base64 | ● A | ○/? 常 WS/异步 | ○ HMAC | ○ HMAC |
| mp3/wav | ● 含 mp3/wav | ● mp3 | ● | ● | ● | ? | ? | ? |
| voice 选项 | ○ 预置英文名 | ● 大量中文 | ● 中文神经网络 | ● | ● 克隆 | ● | ● | ● |
| speed | ● 0.25–4 | ● voice_setting | ● SSML | ● SSML | ○ | ? | ? | ? |
| timestamps | △ 标准 TTS 无 | ? | ● 可选 | ○ | ○ | ? | ? | ? |
| 幂等/request id | △ 追踪为主，**计费去重需确认** | ? | ? | ? | ? | ? | ? | ? |
| API 稳定 / 文档 | ● | ○ 文档分散 | ● | ● | ● | ○ | ○ | ○ |
| rate limit 文档 | ○ | ? | ● | ● | ○ | ? | ○ | ○ |
| 商业授权 | ● | **需确认** 商用条款 | ● | ● | ● 价高 | **需确认** | ● | ● |
| 价格透明 | ● 按字符，60s 成本极低 | ○/? | ○ | ○ | △ 贵 | ? | ○ | ○ |
| 中国大陆网络 | △ 直连常不稳 | ● | △ 需中国区 | △ | △ | ● | ● | ● |
| 开发复杂度 | ● fetch+Bearer | ○ fetch+解码 | ○ region+key | △ 服务账号 JSON | ○ | △ 签名 | △ 签名 | △ 签名 |
| SDK 依赖 | 不需要 | 不需要 | 不需要 REST | 易绑 SDK | 不需要 | 常 SDK | 常 SDK | 常 SDK |
| 国际 SaaS | ● | ○ | ● | ● | ● | △ | △ | △ |
| 与现有代码契合 | ● 同 RealModelProvider | ○ 同 Bearer | ○ | △ | ○ | △ | △ | △ |

OpenAI：`POST /v1/audio/speech`，input **4096** 字符，`response_format` mp3/wav/…，`speed` 0.25–4。返回 **octet-stream**。不返回 duration → 必须本地探测。

MiniMax：`POST /v1/t2a_v2` 同步；`stream:false`；音频常在 JSON 中 hex/base64。中文强、大陆可达性更好。响应结构/计费幂等 **需人工确认官方文档**。

---

## 32. Recommended provider（首选）

**OpenAI-compatible TTS**（实现 id 建议 `openai-tts`）。

协议：`POST {TTS_BASE_URL}/audio/speech`，Bearer，JSON body，**同步音频 bytes（类型 A）**。

原因（相对本项目，不是音色大赛）：

1. 与已有 `fetch` + Bearer + AbortController 一致，6.7 范围最小。
2. 同步 A，无 poll / 无下载器 / 无 SDK。
3. 官方 mp3，FFmpeg 可解；可选 wav。
4. 支持 speed；4096 字符覆盖 15–60s 旁白。
5. 按字符计价，单次约「几厘美元」量级 → **可接受无计费幂等的 crash 重试**（§18 A）。
6. `TTS_BASE_URL` 可指向官方或兼容网关（是否覆盖当前 Chat 网关的 `/audio/speech`：**需人工确认，默认不复用 MODEL_* **）。

代价：中文自然度不是国内第一；从中国大陆直连 `api.openai.com` 可能失败 → 用可达的兼容 `TTS_BASE_URL`，或改走备选。

P0 准入：**同步 A 或 B、中文、mp3 或 wav、商用条款明确、单次 60s 成本低到可接受无幂等。** OpenAI Speech 满足。若实测无 `/audio/speech` 或网络不可达 → 不硬编码死，改实现备选，仍只做 **一家**。

不因「完全没有 request id」拒绝它：成本足够低。若未来首选变成「单次明显计费且无幂等」的厂商 → **拒绝作为第一家**。

---

## 33. Backup provider（备选）

**MiniMax HTTP 同步 T2A v2**（`POST /v1/t2a_v2`，类型 B）。

原因：中文与大陆网络更贴抖音旁白；仍是同步 HTTP + Bearer，无 HMAC。Step 6.7 **不实现**；仅当首选不可达或中文质量不可接受时，作为 **下一个单独 Step** 的候选。

不要同时实现第二家。不要为此上 Router。

Azure Neural 作为更后的企业向备选（中文稳、配置重），不进入 6.7。

---

## 34. Step 6.7 exact scope

只做：

1. `TTS_PROVIDER` token + `MEDIA_TTS_PROVIDER=mock|openai-tts`
2. 一个真实 adapter（OpenAI-compatible Speech）：fetch、超时、魔数、Storage.put、duration 探测、voice preset 映射、credential 配置模块
3. Voice Stage：按 mime 写 filename；orphan delete；checkpoint usage；仍无厂商 if
4. `NODE_ENV=test` 默认 Mock；`RUN_REAL_TTS_TESTS=true` 短句 integration
5. 可选：极短 Script 的 Full Pipeline opt-in（Real TTS + 现有 FFmpeg）
6. `.env.example` 只加 TTS 占位变量（空 Key）
7. 文档：实现说明

**仅当 MP3+`.wav` temp 导致 FFmpeg 失败时：** 按 mime 改 Compose temp 扩展名。否则不改 FFmpeg args / 字幕 escaping / Finalize。

禁止同时：第二家 TTS、ProviderRouter、真实 Image/Video、S3、字幕 timestamps 重构、Schema/migration、改 Agent/ScriptOutput/API/Frontend、Real 失败自动 Mock。

---

## 35. Risks

| 级 | 风险 | 缓解 |
| --- | --- | --- |
| P0 | 测试误打真实 API | test 强制 mock；opt-in；短文本 |
| P0 | Key 进入 Job/日志 | 只在 config 读；sanitized error |
| P0 | 用户以为真配音实为静音 | 禁止生产 Real→Mock |
| P0 | 中国网络打不开官方 Speech | `TTS_BASE_URL`；否则改 Step 做 MiniMax（仍一家） |
| P1 | TTS 成功 / checkpoint 前 crash 重复扣费 | 接受廉价同步；不建表 |
| P1 | MP3 写成 `voice.wav` Compose 失败 | 6.7 最小改 temp 扩展名 |
| P1 | duration 不准导致字幕错位 | 探测优先于厂商字段 |
| P1 | 自由 `voiceStyle` 映射不准 | heuristic + `TTS_VOICE_DEFAULT` |
| P1 | 兼容网关没有 `/audio/speech` | 人工确认；失败则换备选 Step |
| P1 | 审核拒稿 | 不重试，Job FAILED，短 message |

---

## 36. Final architecture

```
POST /videos  → Plan.voice { style, language: zh-CN, speed: 1, text }
enqueue { jobId }     // 无 Key

Worker
  VoiceGenerationStage
    reusable checkpoint? → skip
    TTS_PROVIDER.synthesize({ text, voice: style, language, speed, clientRequestId, storageKey })
         │
         ├─ mock-tts  → 静音 WAV（默认 / 测试）
         └─ openai-tts → fetch /audio/speech → 魔数 → Storage.put → 探测 duration
    Asset AUDIO + VIDEO_AUDIO + checkpoint usage
  Subtitle  ← voiceDuration（探测值）+ 现有 SRT 缩放
  Compose   ← Storage 中的音频（wav 或 mp3）
  finalizeJob  不变
```

Credential 只存在于 Worker 进程的 TTS adapter 配置。Mock 闭环必须可单独运行。

---

## 37. 第一家 Provider 筛选矩阵（决策用）

| P0 条件 | OpenAI-compatible Speech | MiniMax T2A |
| --- | --- | --- |
| 中文可用 | 是（自然度中等） | 是（通常更好） |
| 同步 A/B | A | B |
| mp3 或 wav | 是 | 是 |
| 商用条款公开 | 是 | 需确认 |
| 价格可控 | 是（极低） | 需确认但通常可接受 |
| 无幂等是否可接受 | **是**（因单价） | 视单价，需确认 |
| fetch 无 SDK | 是 | 是 |
| 与现有 HTTP 风格 | 最接近 | 接近 |
| **6.7 采用** | **首选实现** | 不实现，作备选 |

---

Step 6.6 结论：现有 `TtsProvider.synthesize` 合同足够作为 V1 骨架；6.7 用 token 切换 + 一家同步 OpenAI-compatible TTS；Mock 保持默认与测试零费用；不改 Schema / Finalize / Agent / 字幕算法。
