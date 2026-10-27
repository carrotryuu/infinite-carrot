# AGENTS.md

## 项目
AI 视频无限画布：公司内网使用的短剧/漫剧生产画布，参考 NeoWow。
需求全文：docs/requirements.md；任务清单：docs/tasks.md；补充决定：docs/decisions.md（与需求清单冲突时以它为准）；进度：docs/progress.md。没有单独的审核说明书，审核规则见 requirements.md 的 M10、M11 和 tasks.md 的 T12～T18。
开始任何任务前，先读 docs/progress.md 和本任务涉及的需求章节。
开始前先核对 docs/tasks.md「任务总览」里本任务的依赖是否都已完成；有未完成的依赖就停下说明，不要提前实现别的任务的内容。

## 仓库结构
- apps/web      前端（React + Vite + TS + React Flow + Yjs + Zustand）
- apps/server   后端 API（NestJS + Prisma + PostgreSQL）
- apps/worker   异步任务（BullMQ：生成、转码、归档、通知）
- packages/shared  前后端共享类型、权限点枚举、事件定义、zod 校验
- deploy/       docker-compose.yml、Nginx、初始化脚本

## 硬性规则
1. 所有业务表带 team_id 和可空的 tenant_id；查询一律经过统一的 TeamScope 中间件，禁止在接口里手写过滤。
2. 权限点用 packages/shared/permissions.ts 里的字符串枚举（如 review.decide），后端用 @RequirePermission 装饰器校验，前端用 usePermission 控制显隐。
3. 关键操作写 audit_logs：actor、时间、对象类型和 ID、before、after。
4. 浏览器拿不到任何模型 API 密钥、飞书密钥；密钥只从环境变量读，.env.example 列全所有变量。
5. 文件只存 files 表的 ID，前端通过 /files/:id 鉴权读取，绝不暴露 NAS 路径。
6. 流水类表（credit_ledger、generation_records、audit_logs）只追加不修改，修正写冲正记录。
7. 画布的所有改动走 apps/web/src/canvas/commands 命令层；用户操作、Agent、协作都复用它。
8. 新增模型只加适配器（apps/server/src/gateway/adapters），不改业务代码。
9. 时间统一存 UTC timestamptz，显示按 Asia/Shanghai。
10. 只支持 Chrome 和 Edge。
11. 飞书权限由 carrotryuu 在任务进行到需要时开通：开发先用 Mock，到真实联调前停下，在 PR 的「待开通权限」里列出本任务需要的权限和事件订阅，等开通后再联调，不要自行假设已开通。
12. 公司内网有出网限制。需要访问外网的任务（T02、T06、T17 等），开发阶段用 Mock；真实联调前停下，在 PR 的「待放行地址」里列出需要访问的域名和端口（通常是 443），由 carrotryuu 找网管放行后再联调。

## 工作方式
- 一个任务一个分支一个 PR；不做任务范围外的重构。
- 数据库改动必须用 Prisma migration，不手改表。
- 每个任务必须带测试：后端接口用 Vitest + supertest，关键流程用 Playwright。
- 外部服务（模型 API、飞书）一律有 mock 实现，用环境变量 MOCK_EXTERNAL=1 切换；CI 和本地测试默认走 mock。
- 结束前运行：pnpm lint && pnpm typecheck && pnpm test，全部通过才算完成。
- 结束前更新 docs/progress.md：完成内容、未完成项、已知问题、下个任务要注意的事。
- 不确定的需求不要猜：在 PR 描述的「待确认」里列出，按最保守的方式实现。

## 命令
- pnpm dev          本地启动前后端和 worker
- pnpm db:migrate   执行迁移
- pnpm db:seed      写入演示数据（2 个组、3 个项目、7 种角色各 1 人）
- pnpm test / pnpm e2e
- docker compose -f deploy/docker-compose.yml up -d
