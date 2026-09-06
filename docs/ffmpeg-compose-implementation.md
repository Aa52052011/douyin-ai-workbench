# FFmpeg Compose 实现说明（Step 6.5）

状态：**已实现（本机 FFmpeg 可选）。**  
可选 OpenAI-compatible TTS 见 [openai-compatible-tts-implementation.md](./openai-compatible-tts-implementation.md)。未接真实图像 / 视频 API。无 Schema / migration / API 变更。

---

## 1. 闭环

```
COLOR_BACKGROUND PNG（Storage）
+ Mock 静音 WAV 或真实 TTS（mp3/wav）
+ SRT
  → FfmpegComposeProvider（仅 Worker）
  → 真实 MP4（H.264 / AAC / yuv420p）
  → CompositionStage 创建 VIDEO Asset
  → finalizeJob 短事务（VIDEO_OUTPUT + Video + Job）
```

`MEDIA_COMPOSE_PROVIDER=mock`（默认 / `NODE_ENV=test`）：仍用 `MockComposeProvider`，不需要 FFmpeg。

`MEDIA_COMPOSE_PROVIDER=ffmpeg`：Worker 调用本机 `ffmpeg` / `ffprobe`。Backend 入队不读 FFmpeg 路径。仅用 mock 启动 Backend **不会**因未安装 FFmpeg 失败。

Voice 输入可以是 Mock WAV 或真实 TTS MP3。temp 文件按 mime/魔数命名 `voice.wav` / `voice.mp3`，不使用 `originalFilename`。

## 2. 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `MEDIA_COMPOSE_PROVIDER` | `mock` | `mock` \| `ffmpeg` |
| `FFMPEG_PATH` | `ffmpeg` | 命令名或路径，不要把机器绝对路径提交进仓库 |
| `FFPROBE_PATH` | `ffprobe` | 同上 |
| `FFMPEG_TIMEOUT_MS` | `180000` | 单次合成超时 |
| `FFMPEG_MAX_CONCURRENCY` | `1` | 进程内槽位，不是 BullMQ concurrency |
| `RUN_FFMPEG_TESTS` | 未设 | `true` 才跑真实 FFmpeg integration |

`NODE_ENV=test` 且未设 `RUN_FFMPEG_TESTS=true` 时，即使 `MEDIA_COMPOSE_PROVIDER=ffmpeg` 也走 Mock。

## 3. 边界

- Controller / `VideoGenerationService` **不** `spawn`
- `CompositionStage` 只调 `ComposeProvider`
- FFmpeg 细节在 `FfmpegComposeProvider` + `media/ffmpeg/*`
- `spawn(bin, args, { shell: false })`，禁止字符串拼 command
- 输入经 `StorageService.get` materialize 到 `os.tmpdir()` 下的 `acf-ffmpeg-*`，`finally` 删除
- 不读取 `MEDIA_STORAGE_ROOT` 当 FFmpeg 输入路径
- Windows：字幕 filter 转 `/`，转义 `:`，并用 `subtitles=filename='...'` 包一层。FFmpeg 9 会把未加引号的 `C\:/path` 拆成 `filename=C` + `original_size=/path`。`windowsHide: true`

## 4. 时间轴

Scene 视觉时长按 `durationBudget` 缩放到 Voice duration。  
`Video.duration` 来自 **ffprobe** 实际输出（取整秒），不是 `Script.totalDuration`。

成功标准：ffmpeg 退出 0 + 输出 size>0 + ffprobe 有 video + audio + duration>0。  
ffprobe JSON 走独立 stdout 上限（64KiB），不要用 FFmpeg stderr 的 4KiB 截断，否则 FFmpeg 9 的探测 JSON 会解析失败。

## 5. 限制

最多 20 镜、90 秒、边长 16–1920（偶数）、fps ∈ {24,25,30}。字幕 ≤ 1MB。

中文字体依赖本机 libass 默认字体，不同 OS 观感可能不同。不提交字体文件。

FFmpeg 成功而 Asset 行失败：best-effort `Storage.delete`。不建 orphan 表。

Crash：FFmpeg/Storage 成功但 checkpoint 未写时可能重跑 Compose。本地不收费，可接受。

## 6. 测试

普通 unit / e2e **不**要求 FFmpeg。  
`RUN_FFMPEG_TESTS=true` 且本机有 ffmpeg/ffprobe 时跑 integration。未安装则 skip，不让整套测试失败。

## 7. Frontend

详情页仍只展示 Asset id / duration，**没有** HTML 播放器。可通过 `GET /assets/:id/content` 下载。本 Step 不改 UI。
