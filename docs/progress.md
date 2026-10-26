# 开发进度

## 当前状态

T00 已实现并通过代码与 GitHub CI 容器验收，PR #1 待人工审核合并。下一个任务：T01 画布性能 PoC。

## 已定事项（2026-10-26）

- 技术栈：TypeScript 全栈（React + NestJS + Prisma + PostgreSQL + Redis/BullMQ），pnpm 单仓
- 模型：视频 Seedance 2.5（doubao-seedance-2-5-260628）、图像 Seedream 5.0 Pro（doubao-seedream-5-0-pro-260628），走火山方舟；LLM 用 OpenAI gpt-6.1-sol，走公司已有的合法 API 线路（地址填 OPENAI_BASE_URL）
- 飞书：企业自建应用 + 长连接模式；权限由 carrotryuu 在联调前分批开通
- 网络：公司内网有出网限制，联调前在 PR 里列出待放行地址，由 carrotryuu 找网管放行
- Skill：平台不预置，由用户在页面自行上传
- 飞书内审核：通过、备选、退回仅限有审核权限的导演、执行导演、制片；动画师只接收结论
- 角色：7 种，美术并入动画师；动画师负责资产生成和定稿，权限矩阵见 docs/decisions.md 第 2 条
- 审核：没有单独的审核说明书；飞书推送待审卡片，导演可在卡片上直接下结论，细看时跳平台审片页（逐帧、画批）
- T01 性能门槛：平移缩放平均 45 FPS，首屏 3 秒以内

## 待确认

- 参考视频、音频如何提供给模型：暂按 docs/decisions.md 第 4 条的默认做法

## 任务记录

### T00（2026-10-26）

- 已实现：pnpm workspace 四个包；React 18/Vite 空白首页；NestJS `/health`；Redis worker 进程；共享健康类型；Prisma 空 schema；strict TypeScript、ESLint、Prettier、Vitest/supertest、Playwright。
- 部署：web、server、worker、PostgreSQL 16、Redis 7 五个服务；worker 内含 FFmpeg；NAS 用绝对宿主机路径挂载；部署模式仅暴露 web 端口。
- 已通过：lint、typecheck、4 项 Vitest 测试、生产构建、1 项 Chromium 端到端测试。
- GitHub CI 已通过五服务启动、首页和健康接口、FFmpeg、数据库停机后 `down`、重启后 `ok` 的自动验收：[运行记录](https://github.com/carrotryuu/infinite-carrot/actions/runs/40315959553)。
- PR：https://github.com/carrotryuu/infinite-carrot/pull/1；待人工审核合并。
- 本机环境问题：构建 worker 时 C 盘剩余空间为 0，Docker 缓存出现 I/O 错误，Docker Desktop 随后无法启动。本地五服务验收未完成，不能当作通过；需要释放 C 盘空间或迁移 Docker 数据目录后再进行本机部署。
- 下个任务注意：T00 不创建业务表和演示数据；数据库迁移及 seed 随后续业务任务增加。NAS 健康检查只检查目录和读写权限，实际挂载离线探针在 T05 实现。外部业务调用默认 Mock。
