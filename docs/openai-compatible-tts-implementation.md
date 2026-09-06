# OpenAI-compatible TTS 实现说明（Step 6.7）

状态：**已实现第一家同步 TTS（`openai-tts`）。**  
第二家同步 TTS 见 [minimax-tts-implementation.md](./minimax-tts-implementation.md)。未实现 ProviderRouter、真实 Image/Video、对象存储。无 Schema / migration / API / Frontend / Agent 变更。

设计原稿：[real-tts-provider-design.md](./real-tts-provider-design.md)

---

## 1. 选择

```
MEDIA_TTS_PROVIDER=mock|openai-tts
```

默认 `mock`。`NODE_ENV=test` 且 `RUN_REAL_TTS_TESTS != true` → **强制 Mock**，即使 `.env` 写了 `openai-tts` 也不会发真实请求。这是 P0。

真实失败 **不会** 降级 Mock。

## 2. 注入

`TTS_PROVIDER`（与 `COMPOSE_PROVIDER` 相同风格）。  
`VoiceGenerationStage` 只依赖 `@Inject(TTS_PROVIDER) TtsProvider`。

## 3. 配置（独立于 Chat 模型）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `TTS_BASE_URL` | 空 | OpenAI-compatible，通常含 `/v1`。拼接 `/audio/speech`，不会变成 `/v1/v1/...` |
| `TTS_API_KEY` | 空 | **不要**复用 `MODEL_API_KEY` |
| `TTS_MODEL` | 空 | 只进 Provider config / Asset metadata |
| `TTS_VOICE` | `alloy` | V1 所有 preset 都映射到该 voice |
| `TTS_FORMAT` | `mp3` | `mp3` \| `wav` |
| `TTS_TIMEOUT_MS` | `60000` | 与 FFmpeg 超时分离 |
| `TTS_MAX_RESPONSE_BYTES` | `10MiB` | 硬顶 20MiB |
| `RUN_REAL_TTS_TESTS` | 未设/false | `true` 才跑收费 integration |

`mock` 启动不要求 Key。`openai-tts` 缺 `TTS_BASE_URL` / `TTS_API_KEY` / `TTS_MODEL` → `TTS_PROVIDER_NOT_CONFIGURED`（不回显 Key）。

## 4. HTTP

Node `fetch` + `AbortController`。无 SDK。  
`POST {base}/audio/speech`，JSON body：`model` `input` `voice` `response_format` `speed`。  
可选 `X-Client-Request-Id`（**关联 ID，不是厂商计费幂等**）。

## 5. 音频

mp3 → `audio/mpeg` / `voice.mp3`  
wav → `audio/wav` / `voice.wav`  

校验魔数（ID3 / MPEG sync / RIFF+WAVE）。拒绝空 body、HTML、JSON。  
Compose temp 按 mime/魔数写成 `voice.mp3` 或 `voice.wav`，不用 `originalFilename`。

## 6. Duration

真实 TTS **禁止** `ceil(chars/8)`。  
WAV 用文件头；否则 ffprobe 音频流。探测失败则 Provider 失败。  
当前本地 Pipeline 假定 Worker 有 ffprobe（与 FFmpeg Compose 相同）。这不是永久 TtsProvider 合同。

## 7. 已知 crash 窗口

HTTP 已扣费 → Asset/checkpoint 前 crash → stale RUNNING reclaim 可能再扣一次。  
不建 ProviderTask / Outbox。V1 接受低成本同步 TTS 的该风险。

## 8. 测试

普通 `npm test` / `test:e2e`：**零费用 Mock**。  
真实：仅 `RUN_REAL_TTS_TESTS=true` 且三项配置齐全。短句 `你好，这是测试。`  
Real TTS + FFmpeg Pipeline：还要 `RUN_FFMPEG_TESTS=true`。默认 skip。会产生费用。
