# 开发进度

## 当前状态

尚未开工。下一个任务：T00 仓库脚手架与一键部署。

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

（每个任务完成后由 Codex 在此追加：完成内容、未完成项、已知问题、下个任务要注意的事）
