# 开发进度

## 当前状态

T00 已完成并通过 PR #2 合并（5f839d2），旧版备份分支已推送。T01 画布性能 PoC 工程与本机实测已完成，PR #3 已合并（b51bfb2）；目标机验收按用户新决定移到 T23 使用测试，不阻塞 T01 当前交付，45 FPS / 3 秒门槛保持不变。

T02 PR #4 已按用户要求合并（c886398），真实模型测试待放行后补做，进入 T06 时提醒。T03 Mock 登录与账号正在验收，真实飞书联调待权限与网络开通。

## 已定事项（2026-10-26）

- 技术栈：TypeScript 全栈（React + NestJS + Prisma + PostgreSQL + Redis/BullMQ），pnpm 单仓
- 模型：视频 Seedance 2.5（doubao-seedance-2-5-260628）、图像 Seedream 5.0 Pro（doubao-seedream-5-0-pro-260628），走火山方舟；LLM 用 OpenAI gpt-6.1-sol，走公司已有的合法 API 线路（地址填 OPENAI_BASE_URL）
- 飞书：企业自建应用 + 长连接模式；权限由 carrotryuu 在联调前分批开通
- 网络：公司内网有出网限制，联调前在 PR 里列出待放行地址，由 carrotryuu 找网管放行
- Skill：平台不预置，由用户在页面自行上传
- 飞书内审核：通过、备选、退回仅限有审核权限的导演、执行导演、制片；动画师只接收结论
- 角色：7 种，美术并入动画师；动画师负责资产生成和定稿，权限矩阵见 docs/decisions.md 第 2 条
- 审核：没有单独的审核说明书；飞书推送待审卡片，导演可在卡片上直接下结论，细看时跳平台审片页（逐帧、画批）
- 视频格式：只有 MP4，外部上传拒绝 MOV；归档命名场-镜-vN.mp4；飞书通过需二次确认；改判规则见 docs/decisions.md 第 7 条
- 生成误点：3 秒内可取消，不扣积分（T10）
- T01 性能门槛：平移缩放平均 45 FPS，首屏 3 秒以内

## 待确认

- 参考视频、音频如何提供给模型：暂按 docs/decisions.md 第 4 条的默认做法

## 任务记录

### T00（2026-10-27）

- 依据：repo-starter(1).zip；分支 codex/t00-scaffold（原本地分支 task/t00-scaffold）。
- 完成：pnpm 四工作区；React/Vite 首页；NestJS /health（数据库、Redis、NAS 独立检测，故障返回 503，支持恢复）；BullMQ worker 基础进程；TypeScript strict、ESLint、Prettier、Vitest、Playwright；五服务 Compose、Nginx、带 FFmpeg 的 worker 镜像配置；环境变量示例、本地和内网部署说明、CI 配置。
- 验证通过：pnpm lint、pnpm typecheck、pnpm test（4 个文件、8 项测试）、pnpm build、pnpm db:validate；Chrome 和 Edge 分别通过 2 项端到端测试。浏览器测试允许依赖未启动时返回 503，不代表真实数据库/Redis 已就绪。
- 额外检查：pnpm format:check 通过；Compose/CI YAML 可解析，五服务及构建路径存在；安装 Docker 后 docker compose config --quiet 通过；.env、下载工具、NAS 测试目录均被 Git 忽略。静态检查不能代替 Docker 验收。
- 环境：使用应用内置 Node.js 24.19.0 和 Git；pnpm 10.11.0 下载到被忽略的 .tools；已生成依赖锁文件。本机初始无 Docker/WSL，按用户明确要求安装后：WSL 3.0.3、Docker Desktop 4.97.0（当前用户模式，安装器返回 0，Docker Inc 数字签名有效）、Docker CLI 29.9.2、Compose 5.6.1。VirtualMachinePlatform 启用后需要系统重启；本次未重启电脑。
- 容器验收（重启后完成）：scripts/verify-compose.mjs 通过首页、三项健康检查、真实 PostgreSQL 停止后 503/down 及恢复后 200/ok；五服务运行，server/postgres/redis 健康，worker 日志 ready，容器内 FFmpeg 5.1.9 可运行。
- PR：https://github.com/carrotryuu/infinite-carrot/pull/2 已合并。原 main 提交 a48419e 已推送到备份分支 codex/backup-before-t00-20261027；更新继承原历史，不强推。修复 GitHub Actions 在 job env 中不支持 runner.temp 的配置问题后，push 与 PR 两轮 CI 均通过。
- 后续注意：T00 未建业务表或演示数据；Prisma 当前仅数据源和迁移目录，健康检查用 pg 执行 SELECT 1。db:seed 明确返回未实现；T03/T04 再加种子数据。不要提前实现后续业务。

#### 重启后排查与清理（2026-10-27）

- Docker 原 AppData 目录保存配置时，原生文件替换返回 Win32 错误 17；该目录带 Encrypted 属性。独立目录的相同操作成功，未断言加密属性是唯一原因，也未修改系统加密设置。
- 使用 `.local/docker-profile` 保存 Docker 配置与运行数据，仅对启动进程设置 APPDATA/LOCALAPPDATA。引擎已恢复；该目录是活动数据，不是可删除的临时缓存。
- 新增 `start-local.cmd` 和 `scripts/start-local.ps1`，用于重启后启动 Docker、项目服务并打开首页。首页明确显示画布仍在建设中。
- 删除本次下载的 Docker 安装器、pnpm 压缩包及诊断临时脚本/日志，释放约 596.1 MiB 磁盘空间；保留 pnpm 工具、项目依赖和 Docker 活动数据。此前已结束失败的 Docker 进程；当前 Docker 多进程属于运行架构，不按同名一律终止。
- 本次再次通过 lint、typecheck、8 项单元/接口测试和启动脚本语法检查；Chrome、Edge 对容器站点各通过 2 项测试，强制要求真实健康状态为 200，三项依赖均 ok。
- 构建完成后清理未使用构建缓存，Docker 报告回收 1.185 GB；五个活动镜像、五个容器和两个数据卷保留。清理后健康检查仍全部 ok。此数值是 Docker 内部回收量，不保证 Windows 虚拟磁盘立即缩小。

#### 后续启动与复验

1. 当前机器使用根目录 `start-local.cmd` 启动；直接使用原 Docker 快捷方式可能再次命中原 AppData 配置写入问题。
2. Docker CLI 位于 `%LOCALAPPDATA%/Programs/DockerDesktop/resources/bin/docker.exe`。当前终端若尚未刷新 PATH，使用此路径或重新打开终端。
3. Node 位于 `%USERPROFILE%/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`；pnpm 入口为 `.tools/package/bin/pnpm.cjs`。将 Node 目录、仓库 `.tools` 和 Docker CLI 目录临时加到 PATH 后可使用 pnpm.cmd。
4. 根目录已有被忽略的 .env，NAS_ROOT 指向 `D:/infinite-carrot/.local/nas`，本地数据库密码已随机生成；不要打印 .env 内容。
5. 执行 `node scripts/verify-compose.mjs`，检查 worker 容器内 FFmpeg，设置 E2E_BASE_URL 指向容器首页且 E2E_REQUIRE_HEALTHY=1 后重跑浏览器验收。
6. 更新此进度及 docs/t00-pr.md；有远程仓库后再创建 PR。

### T01（2026-10-27）

- PR：https://github.com/carrotryuu/infinite-carrot/pull/3；已合并（b51bfb2），云端检查通过。本机页面 http://127.0.0.1/poc/canvas 已运行。
- 依赖已核对：T00 PR #2 已合并。分支 codex/t01-canvas-poc，范围为 M5 性能 PoC，不包含持久化、业务后端或模型调用。
- 完成：`/poc/canvas`；100 视频、30 图片、20 文本节点、150 连线、MiniMap；五个自生成 720p H.264 样片；视口裁剪、0.4 以下简化卡片、最多四个播放器；Yjs 文档和统一命令入口；页面 FPS/首屏/JS 堆显示、三类操作记录和 JSON 导出。
- 本机生产构建三轮实测：Yjs→首屏 111.3～139.3 ms，平移/缩放平均约 180 FPS，50 节点框选拖动平均 177.0～179.8 FPS。视频挂载和播放峰值均为 4。报告和原始数据见 docs/poc-canvas.md、docs/poc-canvas-results.json。
- 测试：format:check、lint、typecheck、11 项 Vitest 测试通过；Chrome、Edge 对更新后的 Docker 站点各通过 4 项 E2E（要求真实依赖全部健康），覆盖实际 720p 解码、全局播放器上限、低倍率卸载及全部 50 个节点同位移拖动。前端容器已更新，临时生产预览进程已结束；CI 结果随 PR 更新。
- 验收时机变更：用户明确将 16 GB/集显目标机测试移至使用测试，已同步 decisions.md 第 8 条和 tasks.md T01/T23。目标机尚未测试，不能把本机 Ryzen 9700X、32 GB、RTX 5070 的结果当成目标机结果。
- 已知限制：rAF 是主线程回调节奏，不是精确 GPU 呈现帧数；样片为合成图案，本机测试不涵盖真实素材/NAS 延迟与长时内存变化。T23 需补目标机及代表性素材复验。
- CI 环境：Linux 默认 Chromium 的 H.264 解码测试失败，已将测试默认与 CI 安装改为项目支持的正式 Chrome，并保留完整解码断言及失败 trace 上传；Edge 仍通过 PLAYWRIGHT_CHANNEL=msedge 选择。
- 后续注意：T01 的 Yjs 文档仅内存态；正式画布仍需按 T08 的 T01/T04/T05 依赖推进，不提前接入业务功能。

### T02（2026-10-27）

- 依赖核对：T00 已合并；分支 codex/t02-gateway-poc。T01 PR #3 已合并，目标机性能测试仍在 T23。
- 已实现：ModelAdapter、Mock/方舟适配器；Prisma 任务与审计表、TeamScope、权限点；幂等提交、事务状态机、供应商全局并发、轮询与恢复；Socket.IO 和 /poc/gateway 调试页；Compose 自动迁移与 CI 集成测试。
- 已验证：lint、typecheck；14 项默认测试和此前启用真实 PostgreSQL/Redis 的全部 19 项测试通过。默认测试跳过 5 项需基础设施的集成测试；沙箱 EACCES 后在沙箱外重跑默认测试通过。
- 容器验收：8 次同键请求只有 1 个任务；强制 KILL worker 后任务恢复成功，Mock 供应商提交计数仍为 1；20 个独立任务全部成功，整个验收耗时 137581 ms。原始报告见 docs/poc-gateway-results.json。
- 未完成：真实方舟调用与耗时记录；须依 AGENTS.md 第 12 条先确认网络放行和本机密钥配置，未调用收费模型，不能将 Mock 验收写成真实验收。
- 已知边界：真实供应商幂等支持未确认，提交结果不确定时停止自动重发并要求人工对账。PoC 固定测试组，不替代 T03/T04；不含积分与文件落盘。详见 docs/poc-gateway.md。
- 浏览器最终验收：对生产容器站点，Chrome、Edge 各 5 项全部通过（包含真实健康检查、画布回归、20 任务实时更新和刷新恢复）。首次与崩溃验收并行运行因共享队列等待超时，分开运行后通过；截图检查正常。format:check、Prisma validate 通过。
- PR：https://github.com/carrotryuu/infinite-carrot/pull/4（已于 2026-10-28 合并，c886398）。用户确认真实联调条件尚未具备，保留待办；保持 MOCK_EXTERNAL=1，不调用真实模型。云端检查状态以 PR 为准。

- 2026-10-28 用户决定：先合并 T02，真实模型测试待放行后补做；不阻塞 T03 开发。进入 T06 时必须先提醒用户补做 T02 真实模型联调，确认网络、密钥和模型权限，未获确认继续 Mock。

### T03（2026-10-28）

- 依赖：任务总览仅要求 T00，已合并；用户已明确允许 T02 先合并、真实模型测试待放行后补做。分支 codex/t03-auth。
- 完成：users Prisma migration；组织身份专用 TeamScope；union_id 唯一、首次待分配、重复同步姓名/头像；Redis 七天会话与 HttpOnly/SameSite Cookie；OAuth state 浏览器绑定、单次消费、PKCE、企业 tenant_key 校验；Mock 七个演示身份；登录/回调/账号页；退出；账号停用与会话版本撤销。
- 边界：不提前实现 T04 的组、项目、角色或账号管理页面。身份分区 team_id 不代表组归属；七个演示名称不授予角色。停用服务校验 account.manage，T04 后续通过正式授权接口复用。
- 验证：lint、typecheck、Prisma validate 通过；真实 PostgreSQL/Redis 的 26 项 Vitest 测试通过；迁移与七人种子已在本机执行。浏览器最终结果待下方记录。
- 部署：T03 server/web 镜像已构建并部署；worker 业务未变，继续使用 T02 已验证镜像。全量构建因上游 Node 基础镜像更新触发 FFmpeg 重新下载，已停止本任务不需要的 worker 重建。未修改或删除 Docker 活动数据。
- 未完成：真实飞书账号联调。PR 的待开通权限/待放行地址见 docs/t03-pr.md，须按 AGENTS.md 第 11、12 条确认后执行，不能把 Mock 验收写成真实成功。
- 下个任务注意：T04 尚需两组、三项目、角色与 memberships；复用会话版本停用服务，新增正式权限路由。进入 T06 必须提醒补做 T02 真实模型测试，tasks.md 已加入开始前提醒。
- 最终验收：Chrome、Edge 对生产容器各 7 项全部通过，包括登录/待分配/退出、真实停用后 401 跳转、画布与 20 任务网关回归。登录页截图检查正常，Nginx 配置检查通过，OAuth 查询参数已从访问日志移除。format:check 通过。
- 环境问题：首次完整回归遇到重建数据库/Redis 后旧 worker 初始化失败，模型任务超时；依赖健康后重启 worker，积压恢复，重跑全部通过。后续基础设施重启应检查 worker ready，不能只看容器仍存活。
- PR：https://github.com/carrotryuu/infinite-carrot/pull/5（草稿，未合并）。实现提交 4c4bf53 的 push/PR 两轮 CI 均通过。用户已确认飞书联调条件尚未准备好，保留 T03 真实联调待办，不启用真实外部服务。

- 2026-10-28 用户要求进行 T04，真实飞书接入稍后补做；据此先合并 T03 作为依赖，保留真实联调待办。
