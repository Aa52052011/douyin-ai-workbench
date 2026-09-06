# Video Finalization Consistency 实现说明（Step 6.4）

状态：**已实现。**  
设计：[real-media-provider-readiness-design.md](./real-media-provider-readiness-design.md)

未接真实 Provider / FFmpeg / 对象存储。无 Schema / migration / API / Frontend 变更。

---

## 1. 原调用链（修复前）

```
CompositionStage
  → Storage.put
  → TX: Asset + VIDEO_OUTPUT + Video.COMPLETED
VideoGenerationService
  → checkpoint compose
  → jobs.complete()
```

两个提交边界。Compose 成功后的异常可以把 Job 打成 FAILED，而 Video 保持 COMPLETED。

## 2. 现调用链

```
CompositionStage
  → Storage.put（事务外）
  → Asset READY
  → 返回 outputAssetId + duration
  → checkpoint（Compose READY ≠ 业务完成）

VideoGenerationService
  → finalizeJob()
  → 短 DB transaction
        Asset 校验（READY、同租户三维）
        VIDEO_OUTPUT 确认或创建
        Video COMPLETED + outputAssetId + sourceJobId + duration
        Job.output merge（保留 stages/usage/timeline，写入 final）
        Job COMPLETED progress=100
  → COMMIT
```

`Compose READY` ≠ `Video COMPLETED`。

## 3. 入口

`finalizeJob`（`apps/backend/src/videos/finalize-video-job.ts`）。内部方法，无 HTTP。

不信任调用方的 workspace/project；一律按 `jobId + tenantId` 重读。

Finalize **不**调用 Storage / 网络。

## 4. 幂等与恢复

| 状态 | 行为 |
| --- | --- |
| 已完全一致 COMPLETED，同一 Asset | no-op |
| 仅有 VIDEO_OUTPUT | 补 Video 指针并完成 Job |
| 仅有 outputAssetId | 补 VIDEO_OUTPUT 并完成 Job |
| Link 与指针指向不同 Asset | `VIDEO_CONFLICT`，不猜测 |
| 已完成后再 finalize 另一 Asset | `VIDEO_CONFLICT` |
| Job FAILED / CANCELLED | `JOB_CONFLICT` |

不会靠捕获 unique violation 当正常路径。

## 5. fail 终态保护

`JobsService.fail` 仅更新 `PENDING | RUNNING`。COMPLETED / CANCELLED 不会变成 FAILED。  
`run()` catch：若 Job 已是 COMPLETED，不再 fail。

## 6. Mock

`__mock_fail_finalize__` 仅 Mock：Compose Asset 已就绪后失败，用于证明 Video 不会提前 COMPLETED。

Crash recovery 语义：只 reclaim **stale RUNNING** Job。FAILED 不会因 lease 过期自动复活。部分测试会把 FAILED 改回 RUNNING 以构造用例，那不是产品路径。
