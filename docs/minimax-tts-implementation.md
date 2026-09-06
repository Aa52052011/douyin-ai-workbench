# MiniMax 同步 TTS 实现说明（Step 6.7-M）

状态：**已实现第二家同步 TTS（`minimax-tts`）。**  
未实现 ProviderRouter、自动 fallback、真实 Image/Video、对象存储。无 Schema / migration / API / Frontend / Agent / Finalize 变更。`openai-tts` 与 Mock 保留。

---

## 1. 选择

```
MEDIA_TTS_PROVIDER=mock|openai-tts|minimax-tts
```

默认 `mock`。`NODE_ENV=test` 且 `RUN_REAL_TTS_TESTS != true` → **强制 Mock**，即使 `.env` 写了 `minimax-tts` 也不会发真实请求。这是 P0。

真实失败 **不会** 降级 Mock 或 openai-tts。

## 2. 官方合同（2026-08-31 platform.minimax.io）

同步 HTTP：`POST {MINIMAX_TTS_BASE_URL}/t2a_v2`  
官方完整路径示例：`https://api.minimax.io/v1/t2a_v2`（BASE_URL 含 `/v1`）。  
Authorization：`Bearer <key>`。  
`output_format=hex`（非流式；不使用 24h URL）。  
`stream=false`。  
`audio_length`：**毫秒**。  
`usage_characters`：计费字符。  
`base_resp.status_code === 0` 才算业务成功。HTTP 200 不够。

本实现 **不是** WebSocket / 异步任务 / Voice Clone / Voice Design。

`trace_id` 是官方排障会话 ID，**不是** 计费幂等。`X-Client-Request-Id` 仅本地关联。**NOT provider-enforced idempotency。**

## 3. 配置

独立于 `MODEL_*` 与 `TTS_*`（openai-tts）。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `MINIMAX_TTS_BASE_URL` | 空 | 通常 `https://api.minimax.io/v1` |
| `MINIMAX_TTS_API_KEY` | 空 | 禁止复用 Chat Key |
| `MINIMAX_TTS_MODEL` | `speech-2.8-turbo` | 只进 Provider / Asset metadata |
| `MINIMAX_TTS_VOICE` | 空，**必填** | MiniMax `voice_id`。缺失 → `TTS_PROVIDER_NOT_CONFIGURED` + `MINIMAX_TTS_VOICE missing` |
| `MINIMAX_TTS_FORMAT` | `mp3` | `mp3` \| `wav` |
| `MINIMAX_TTS_LANGUAGE_BOOST` | `Chinese` | 官方枚举，非法值拒绝 |
| `MINIMAX_TTS_TIMEOUT_MS` | `60000` | 与 FFmpeg / OpenAI TTS 超时分离 |
| `MINIMAX_TTS_MAX_RESPONSE_BYTES` | `20MiB` | JSON+hex，硬顶 40MiB |

`mock` 启动不要求 MiniMax 配置。

## 4. 请求体

```json
{
  "model": "<MINIMAX_TTS_MODEL>",
  "text": "<ProductionPlan.voice.text>",
  "stream": false,
  "language_boost": "Chinese",
  "output_format": "hex",
  "voice_setting": { "voice_id": "<MINIMAX_TTS_VOICE>", "speed": 1, "vol": 1, "pitch": 0 },
  "audio_setting": { "sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1 }
}
```

V1 全部 preset fallback 到 `MINIMAX_TTS_VOICE`。`Script.voiceStyle` / ProductionPlan 不写 vendor voice id。  
Speed 官方范围 `[0.5, 2]`。非法 → `TTS_PROVIDER_INVALID_INPUT`。

## 5. 解码与 Storage

JSON → 校验 `base_resp` → hex 偶数字符/合法 hex → Buffer → 魔数（复用 `audio-format`）→ `StorageService.put`。  
禁止把 MiniMax URL 当 `Asset.storageKey`。

Duration：本地 probe 为权威；否则用 `audio_length/1000`。禁止 `ceil(chars/8)`。

Usage：`usage_characters`、真实 `audioSeconds`、`provider=minimax-tts`、配置 model。不写死价格。

## 6. 错误

HTTP 与 `base_resp.status_code`（1004/2049 AUTH，1002/1039 RATE_LIMIT，1008/2056 QUOTA，1001 TIMEOUT，1026/1027/1042 CONTENT_REJECTED，2013 INVALID_INPUT…）映射到现有 `TTS_PROVIDER_*`。不把完整 JSON 写入 Job.error。

Provider 内单次调用。已知 crash 窗口：已扣费 → checkpoint 前崩溃可能再扣一次。

## 7. 测试

普通 `npm test` / `test:e2e`：**零费用 Mock**。  
真实 MiniMax：仅 `RUN_REAL_TTS_TESTS=true` + `MEDIA_TTS_PROVIDER=minimax-tts` + Key/URL/model/voice 齐全。短句 `你好，这是测试。` 会产生少量费用。  
Pipeline：还要 `RUN_FFMPEG_TESTS=true`。默认 skip。
