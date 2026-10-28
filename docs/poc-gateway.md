# T02 模型网关 PoC

## 交付范围与验收状态

页面：`/poc/gateway`。已实现 Mock 提交、排队、轮询、实时状态、取消、刷新恢复和 worker 重启恢复。真实方舟适配器已实现并通过模拟 HTTP 协议测试，**尚未调用真实模型，真实耗时与结果 URL 域名待联调记录**。T02 不能据此认定全部验收完成。

T02 依赖 T00（PR #2 已合并）；T01 PR #3 已合并。16 GB/集显目标机性能测试继续放在 T23 使用测试，与本任务无关。

## 启动和复现

复制 `.env.example` 后配置数据库与 NAS，设置 `POC_GATEWAY_ENABLED=1`、`MOCK_EXTERNAL=1`。默认 Mock 随机 10～30 秒，失败率 0，并发 4。执行 `docker compose up -d --build`，打开 `/poc/gateway`。server 启动时部署 Prisma migration，worker 等 server 健康后启动。

本地开发先启动 postgres/redis 的 dev overlay，运行 `pnpm db:generate`、`pnpm db:migrate`、`pnpm dev`。worker 使用 server 编译产物；修改适配器后重新运行 `pnpm dev`。

- 页面点击“提交 20 个任务”，观察每行状态、进度和实时连接状态；刷新后仍能查到任务。
- 重复相同幂等键和输入返回同一个任务；相同键不同输入返回 409。
- `node scripts/verify-gateway.mjs` 仅允许本机 Mock，强制终止 worker 后恢复，再验证 20 个任务；报告写入 `.local/poc-gateway-acceptance.json`。
- `GATEWAY_INTEGRATION_TESTS=1` 配合 `.env` 运行 Vitest，测试真实 PostgreSQL/Redis；CI 自动运行。默认无基础设施的 `pnpm test` 跳过这 5 项集成测试。
- `E2E_BASE_URL=http://127.0.0.1`、`POC_GATEWAY_ENABLED=1`、`E2E_REQUIRE_HEALTHY=1` 下执行 `pnpm e2e`，可对容器验收；Edge 加 `PLAYWRIGHT_CHANNEL=msedge`。

## 状态和恢复机制

`generation_tasks` 是状态真相；BullMQ 按供应商设置全局并发。数据库提交后定期补入漏入队任务，任务 ID 同时作为队列 job ID。Socket.IO 只提示状态变化，连接恢复时从数据库重新读取；页面每 5 秒同步一次。任务保留 team_id/可空 tenant_id，所有业务查询经 TeamScope；状态变化与审计在事务内写入，审计表数据库触发器禁止修改和删除。

Mock 的供应商记录在 Redis 持久化，确定性供应商 ID 与原子首次提交保证重试不创建第二次生成。已保存真实供应商任务 ID 时，worker 重启只恢复轮询。对于真实 POST 已发出、但响应或数据库保存中断的窗口，供应商幂等支持尚未确认，因此标记 `SUBMISSION_UNCERTAIN_RECONCILE_PROVIDER`，要求人工查供应商记录，不盲目重发。不能把 Mock 的可恢复保证扩大为真实供应商的无条件 exactly-once。

供应商取消仅支持其允许的状态；不支持时继续轮询并显示错误码。超时需要人工对账，不代表供应商一定停止计费。PoC 不实现积分、素材落盘或正式账号体系；固定服务端测试组不能替代 T03/T04 的真实权限。默认关闭调试网关；Mock 页面仅用于隔离测试环境。

## 方舟协议与待联调

适配器使用 POST `/api/v3/contents/generations/tasks` 提交，GET `/{id}` 轮询，解析 `content.video_url`；默认轮询间隔 1 秒。仅 queued 状态尝试 DELETE 取消，不对完成任务执行删除。费用尚未确认，估价返回未知，不能作为记账依据。

协议依据：[官方 Python SDK 示例](https://github.com/volcengine/volcengine-python-sdk/blob/master/volcenginesdkexamples/volcenginesdkarkruntime/content_generation_tasks.py)、[官方取消/删除说明](https://docs.volcengine.com/docs/ark/cancel-or-delete-video-generation-tasks-api)。并发与恢复参考 [BullMQ global concurrency](https://docs.bullmq.io/guide/queues/global-concurrency)、[stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs)。

真实联调前，由 carrotryuu 确认放行 `ark.cn-beijing.volces.com:443`，在本机环境配置 ARK_API_KEY（不要发到聊天或提交 Git），确认账号可用模型 ID。结果 CDN 域名需依据真实响应追加，当前不猜测。还需配置独立的至少 32 字符 POC_ACCESS_TOKEN，页面仅在内存中持有此调试访问令牌，不接触模型密钥。

获准后才设置 `MOCK_EXTERNAL=0`、`MODEL_POC_PROVIDER=ark`、`ALLOW_REAL_MODEL_CALLS=1`，执行一次真实调用，记录模型 ID、开始/完成 UTC 时间、完整耗时、状态序列、取消限制、结果可访问性和实际计量。当前这些结果均为待测，不能填写 Mock 耗时代替。

## 已知限制

调试页最多读取最近 200 项，恢复扫描每轮最多 1000 项；Mock 供应商 Redis 记录暂不自动清理。这里只验证最小闭环，不是大规模任务调度或数据保留策略。真实结果 URL 暂存是 T02 明确范围，正式文件权限与落盘留给后续任务。
