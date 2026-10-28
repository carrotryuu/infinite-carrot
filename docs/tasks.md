# AI视频无限画布 · Codex 任务书（RAE）

Oct 26, 2026 · @carrotryuu

## 使用说明

本任务书把《开发需求清单 v0.1》拆成 24 个 Codex 任务，每个任务一次会话、一个 PR，按 RAE 写成：

- **R 角色（Role）**：Codex 以什么身份、在哪段代码里工作，要先读哪些文件
- **A 行动（Action）**：具体要做的事、改动范围、明确不做的事
- **E 期望（Expectation）**：交付物、验收命令、对应需求清单「达成效果」的验收标准

这里把 RAE 理解为「角色 · 行动 · 期望」；如果你们团队的 RAE 是别的含义，告诉我再改。

**怎么喂给 Codex**

1. 建空仓库，把下一节的 AGENTS.md 放在根目录，把需求清单原文放到 `docs/requirements.md`
2. 按「任务总览」的依赖列安排顺序，不只看编号：一个任务的依赖全部合并后才能开始；一次复制一个任务的 R、A、E 三段给 Codex，让它开分支、提 PR
3. 合并前由人按 E 段逐条验；E 段不过就把失败项贴回同一会话让它修，不开新任务
4. 每个任务结束，Codex 必须更新 `docs/progress.md`（做了什么、遗留问题、下个任务需要知道的事），下一个任务的 R 段会要求先读它

**技术栈锁定**

需求清单里后端是 Node 或 Go 二选一。为了让 Codex 前后端共用类型、少出错，这份任务书统一按 TypeScript 全栈写；该方案已确认。

| 层 | 选型 |
| --- | --- |
| 仓库 | pnpm workspace 单仓：`apps/web`、`apps/server`、`apps/worker`、`packages/shared` |
| 前端 | React 18 + TypeScript + Vite，Zustand，React Flow（@xyflow/react），Yjs，hls.js，ECharts |
| 后端 | NestJS + Prisma + PostgreSQL 16 |
| 队列与推送 | Redis 7 + BullMQ；Socket.IO 推送任务状态和审核结论 |
| 媒体 | FFmpeg（封面帧、720p HLS） |
| 飞书 | @larksuiteoapi/node-sdk，事件和卡片回调走长连接模式 |
| 测试 | Vitest（单元、接口），Playwright（端到端） |
| 部署 | Docker Compose 一键起全部服务 |

## AGENTS.md（放仓库根目录）

Codex 每次会话都会自动读这个文件，所以全局规则只写在这里，各任务不再重复。

```markdown
# AGENTS.md

## 项目
AI 视频无限画布：公司内网使用的短剧/漫剧生产画布，参考 NeoWow。
需求全文：docs/requirements.md；任务清单：docs/tasks.md；补充决定：docs/decisions.md（与需求清单冲突时以它为准）；进度：docs/progress.md。没有单独的审核说明书。
开始任何任务前，先读 docs/progress.md 和本任务涉及的需求章节。

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
```

## 任务总览

内测 1.0 共 24 个任务（T00～T23），分 6 个阶段；前端线和后端线在 T07 之后可以并行开两个 Codex 会话。

| 编号 | 任务 | 模块 | 依赖 | 线 |
| --- | --- | --- | --- | --- |
| T00 | 仓库脚手架与一键部署 | 通用 | — | 共用 |
| T01 | PoC：100 个视频节点画布性能 | M5 | T00 | 前端 |
| T02 | PoC：模型网关最小闭环 | M3 | T00 | 后端 |
| T03 | 飞书登录与账号 | M1 | T00 | 后端 |
| T04 | 组织、角色、权限点 | M1 | T03 | 后端 |
| T05 | NAS 文件服务 | M2 | T04 | 后端 |
| T06 | 模型网关与任务队列 | M3 | T02、T05 | 后端 |
| T07 | 积分分配、汇总、对账与模型配置后台 | M4 | T06 | 后端 |
| T08 | 画布基础 | M5 | T01、T04、T05 | 前端 |
| T09 | 节点注册表与节点类型 | M6 | T07、T08 | 前端 |
| T10 | 生成节点接入网关 | M3、M6 | T07、T09 | 前后端 |
| T11 | 节点历史界面与素材对比 | M7 | T10 | 前端 |
| T12 | 场、镜头、送审与外部上传 | M10 | T05、T10 | 后端 |
| T13 | 转码与审片播放器 | M10 | T12 | 前后端 |
| T14 | 画批、审核结论与回流画布 | M10 | T13 | 前后端 |
| T15 | 归档与回收站 | M10、M2 | T14 | 后端 |
| T16 | 事件总线与站内通知 | M11 | T14 | 后端 |
| T17 | 飞书机器人：群推送与催办 | M11 | T16 | 后端 |
| T18 | 飞书机器人：管理指令与卡片操作 | M11 扩展 | T17 | 后端 |
| T19 | 资产库 | M8 | T09 | 前后端 |
| T20 | Agent 对话与画布工具 | M9 | T10、T19 | 前后端 |
| T21 | Skill 管理与调用 | M9 | T20 | 前后端 |
| T22 | 积分看板与导演看板 | M4 | T07、T14 | 前后端 |
| T23 | 端到端验收与部署交付 | 全部 | 全部 | 共用 |

## 阶段 0：脚手架与 PoC

这一阶段回答两个风险问题：画布扛不扛得住一集的规模，模型异步任务能不能跑通。PoC 结论不过，后面不开工。

### T00 仓库脚手架与一键部署

**R**：你是这个项目的首位全栈工程师，仓库目前只有 AGENTS.md 和 docs/。先读 AGENTS.md 和 docs/requirements.md 的「通用约定与技术栈建议」。

**A**

- 按 AGENTS.md 的结构建 pnpm workspace：apps/web、apps/server、apps/worker、packages/shared
- 配好 ESLint、Prettier、TypeScript strict、Vitest、Playwright
- deploy/docker-compose.yml 起 5 个服务：web（Nginx 托管前端并反代）、server、worker（镜像内装好 FFmpeg）、postgres、redis；NAS 用宿主机目录挂载，路径由 NAS\_ROOT 环境变量决定
- server 提供 /health，返回数据库、Redis、NAS 目录三项状态
- 写 .env.example、README（本地开发与内网部署两套步骤）、docs/progress.md 初始版
- 不做：任何业务表和业务页面

**E**

- `docker compose up -d` 后访问 http://localhost 能看到前端空白首页，/api/health 三项均为 ok
- `pnpm lint && pnpm typecheck && pnpm test` 通过（至少各有 1 个示例测试）
- 停掉 postgres 容器，/api/health 对应项变为 down，接口不崩

### T01 PoC：100 个视频节点画布性能

**R**：你是前端性能工程师，在 apps/web 里做一次性 PoC，代码放 apps/web/src/poc/，结论决定画布方案是否成立。

**A**

- 用 React Flow 自定义视频节点：默认只显示封面图，悬停或选中时才挂载 `<video>`
- 开启只渲染视口内节点；缩放低于 0.4 时节点切换为只有标题的简化卡片
- 生成测试数据：100 个视频节点（720p 短视频样片循环引用 5 个文件即可）+ 30 个图片节点 + 20 个文本节点 + 150 条连线，接上 MiniMap
- 画布数据放进一个 Yjs 文档，测从 Yjs 加载到首屏的耗时
- 写一个页面内的 FPS 计数器，记录平移、缩放、框选 50 个节点拖动时的帧率
- 不做：持久化、后端接口

**E**

- 输出 docs/poc-canvas.md：机器配置、首屏耗时、三种操作的平均和最低 FPS、内存占用、结论与建议阈值
- T01 先在当前可用机器实测并标明硬件。根据 decisions.md 第 8 条，普通办公电脑（16GB 内存、集显）Chrome 的目标机验收移到 T23 使用测试；平移缩放平均 FPS 不低于 45、首屏不超过 3 秒的硬性门槛不变。达不到就写清瓶颈和替代方案，不要硬调参数掩盖
- 同时播放的 `<video>` 元素任何时刻不超过 4 个

### T02 PoC：模型网关最小闭环

**R**：你是后端工程师，要验证「提交 → 排队 → 生成中 → 回填」这条异步链路，代码写在 apps/server 和 apps/worker，后续 T06 会在此基础上扩展。

**A**

- 定义适配器接口 ModelAdapter：submit、getStatus、cancel、parseResult、estimateCost
- 实现两个适配器：MockVideoAdapter（随机 10～30 秒完成，可配置失败率）和一个真实视频模型适配器（模型由 MODEL\_POC\_PROVIDER 指定，密钥读环境变量）
- generation\_tasks 表带状态机（queued、running、succeeded、failed、canceled）和幂等键
- BullMQ 队列按供应商限并发；worker 轮询供应商状态并写回任务
- Socket.IO 推送任务状态；做一个临时调试页能提交任务、看状态实时变化
- 不做：积分、文件落盘（结果先存原始 URL）

**E**

- 用 Mock 适配器一次提交 20 个任务，调试页 20 行状态各自实时变化，最终全部终态
- 同一个幂等键重复提交，只产生 1 个任务
- worker 进程在任务运行中被重启，任务恢复并最终完成，不重复提交给供应商
- 输出 docs/poc-gateway.md：真实模型一次完整调用的耗时、状态查询方式（轮询或回调）、踩坑记录

## 阶段 1：底座（M1～M4）

这一阶段做完，后端具备登录、按组隔离、存文件、调模型、记积分五项能力，画布线可以开始接真接口。

### T03 飞书登录与账号

**R**：你是后端工程师，负责账号体系。先读 docs/requirements.md 的 M1 和 docs/decisions.md 第 2 条（权限矩阵）。

**A**

- 接飞书网页应用 OAuth 授权码登录，以 union\_id 作为用户唯一标识，同步姓名、头像；不开放注册，首次登录自动建账号，状态为「待分配」
- 会话用 HttpOnly Cookie + 服务端 session（存 Redis），7 天有效
- users 表含 status（active、disabled），停用后会话立即失效、无法再登录，历史数据不删
- 本地开发提供 MOCK\_EXTERNAL=1 下的假登录：选择种子用户直接登录
- 前端：登录页、登录回调页、顶栏显示头像和姓名

**E**

- 真实飞书账号能登录；首次登录的人看到「等待管理员分配」页
- 停用账号后，该用户已打开的页面下一次请求返回 401 并跳登录页
- 测试覆盖：首次登录建号、重复登录不重复建号、停用拦截

### T04 组织、角色、权限点

**R**：你是后端工程师，在 T03 的账号上建组织和权限，这是所有后续接口的地基。

**A**

- 表：teams、projects、memberships（user、team、project 可空、role）、roles、permissions、role\_permissions、audit\_logs
- packages/shared/permissions.ts 定义权限点：canvas.view、canvas.use、review.decide、skill.publish、template.publish、credit.allocate、model.configure、member.manage、account.manage、global.view（各角色组合见 docs/decisions.md 第 2 条）
- 预置 7 个角色及其权限组合：导演、执行导演、动画师（美术已合并进动画师）、剪辑、制片、老板、HRBP（剪辑没有画布编辑权，老板只读）
- TeamScope 中间件：从会话读当前组，自动给 Prisma 查询加 team\_id 过滤；项目级接口再校验项目内角色
- 用户可属于多个组，顶栏切换当前组
- HRBP 后台页：创建组、分配组和角色、停用、调组；所有变更写 audit\_logs
- 按 decisions.md 第 11 条补充 team.create / project.create：HRBP 建组，导演在当前组建项目，制片建项目归公司组；公司组要求显式项目成员关系
- 前端 usePermission(point, projectId?) 钩子

**E**

- 种子数据下，A 组成员调用 B 组任何项目、文件、人员接口均返回 404（不是 403，避免泄露存在性）
- 同一人在 X 项目是导演、Y 项目是动画师，两边按钮显隐与接口权限各自正确
- 写一个测试遍历所有已注册路由，断言每个路由都声明了权限或显式标记为公开

### T05 NAS 文件服务

**R**：你是后端工程师，负责所有文件的落盘和读取。先读 M2。

**A**

- NAS\_ROOT 下分区：staging（平台暂存）、to-archive（待归档）、backup（备份）；项目正式目录只读挂载，平台不写
- files 表：路径、大小、sha256、mime、来源（generated、uploaded）、team\_id、project\_id、状态（ok、missing）
- 接口：上传（分片 + 断点续传，单文件上限 500MB）、按 ID 鉴权读取（支持 Range）、从 URL 拉取落盘（给模型结果用）
- worker 任务：视频落盘后用 FFmpeg 抽封面帧、转低清预览
- NAS 在线检测：每分钟检查一次写入探针文件；离线时写操作返回明确错误码 NAS\_OFFLINE，并通过 Socket.IO 广播状态
- 文件读取发现磁盘上不存在时，标记 missing 并返回占位图，不抛 500
- 每日 03:00 pg\_dump 到 backup，保留最近 30 份

**E**

- 删除 NAS\_ROOT 挂载（或改为只读）后 1 分钟内，/api/health 显示 NAS down，前端状态灯变红；恢复后自动变绿
- 手动在磁盘上删掉一个文件，前端显示「文件已丢失」占位，无报错弹窗
- 上传 400MB 文件中途断网，恢复后从断点继续

### T06 模型网关与任务队列

**开始前提醒（用户决定，2026-10-28）**：T02 已允许先合并，“真实模型测试待放行后补做”。进入本任务时必须提醒用户准备网络放行、服务端密钥和模型权限，并补做 T02 真实模型联调；未经确认保持 Mock，不把待办误记为已验收。

**R**：你是后端工程师，把 T02 的 PoC 升级为正式网关。先读 M3 和 docs/poc-gateway.md。

**A**

- 适配器注册表：按 provider + model 注册，包含 LLM、图像、视频三类；第一批接入的模型清单见本任务书末尾「待确认」
- 生成成功后自动调用 T05 的「从 URL 拉取落盘」，任务结果只存 file\_id
- 失败自动重试，次数按模型配置；记录失败原因（供应商错误码 + 可读中文说明）
- 支持取消；支持手动重试（生成新任务，关联原任务）
- 参考图发给模型：优先供应商文件上传接口或 base64；必须给 URL 时，生成 10 分钟有效的签名链接
- 任务状态通过 Socket.IO 推到房间 canvas:{canvasId}
- 本任务负责两张最小基础表，T07 在其上做后台和对账，不再重建：
    - model_configs：provider、model、启用停用、默认参数（JSON Schema + 默认值）、计费规则（计量单位、单价、积分折算比）；本任务用种子数据或脚本写入，后台页面在 T07
    - credit_ledger：只追加；人、组、项目、节点、任务、模型、usage_type（chat、generation）、计量单位、用量、积分、成本、供应商是否实际收费；由网关在每次调用结束时统一写入，业务代码不直接写

**E**

- 一次提交 20 个视频任务，页面不卡，每个任务状态独立推送
- 生成中刷新页面，任务继续，完成后自动出现
- 用 Mock 适配器设 100% 失败，任务按配置次数重试后进入 failed，失败原因可读
- 抓前端所有网络请求，不出现任何模型密钥
- 模型原始 URL 失效后（Mock 返回会过期的 URL），文件仍可读取

#### T06 附：第一批接入 API

第一批接两家：视频、图像走火山方舟（ARK\_API\_KEY），LLM 走 OpenAI（OPENAI\_API\_KEY）。OpenAI 走公司已有的稳定合法 API 线路，地址填入 OPENAI\_BASE\_URL（已定）。火山方舟模型 ID 已在控制台核对。

| 类别 | 模型 | 模型 ID | 接口（视频、图像基址 https://ark.cn-beijing.volces.com/api/v3） | 调用方式 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 视频 | Seedance 2.5 | doubao-seedance-2-5-260628 | POST /contents/generations/tasks；GET /contents/generations/tasks/{id} | 异步：建任务后每 8～15 秒轮询，单条通常 1～3 分钟 | video\_url 约 24 小时失效，成功后立即落盘 |
| 图像 | Seedream 5.0 Pro | doubao-seedream-5-0-pro-260628 | POST /images/generations | 同步返回，耗时以 PoC 实测为准；仍放进 worker 队列执行。输出 1K、1.5K、2K，支持多图参考与编辑 | URL 24 小时失效，立即落盘 |
| LLM | ChatGPT（OpenAI）（Agent、剧本拆解用） | gpt-6.1-sol（主力）；简单任务可用 gpt-6-luna 降本；以 OpenAI 模型页为准 | 基址 https://api.openai.com/v1，POST /responses（函数调用） | 流式 SSE | — |

**交给 Codex 的补充要求（追加到 T06 的 A 段）**

- 环境变量：ARK\_API\_KEY、ARK\_BASE\_URL、OPENAI\_API\_KEY、OPENAI\_BASE\_URL（可指向公司出网代理）；模型 ID 存 model\_configs，代码里不写死
- 实现 ArkVideoAdapter、ArkImageAdapter、OpenAIChatAdapter（Responses API，函数调用 + 流式） 三个适配器；图像接口虽是同步的，也包装成任务走队列，前端状态流转与视频一致
- Seedance 参数写进 JSON Schema：时长（4～30 秒）、分辨率（480p、720p、1080p）、画幅、首帧、尾帧、参考图、seed、camera\_fixed、watermark、return\_last\_frame；参考素材数量上限以官方文档为准
- 计费：Seedance 按 token 计价（分辨率不同、是否含参考视频单价不同），Seedream 5.0 Pro 按张，官方按输出像素分档，且第 2 张起的输入参考图另计费，LLM 按 OpenAI 输入、输出、缓存 token 分别计价；单价只在 model\_configs 后台填写，按方舟官方价目
- 内容安全拦截单独返回错误码 CONTENT\_BLOCKED，节点上提示「提示词或参考图未通过审核」，是否计费按方舟规则记
- 出网白名单（公司有出网限制，联调前按此清单申请放行）：ark.cn-beijing.volces.com、公司 OpenAI 线路的地址，以及结果文件下载域名（以实际返回 URL 的域名为准）

**补充验收（追加到 T06 的 E 段）**

- 用真实密钥，视频、图像、LLM 各跑通 1 次，每次调用都在 credit_ledger 留下一条记录（与控制台的逐笔对账放在 T07 验收）
- 结果 URL 过期后，画布上的文件仍可正常读取

### T07 积分流水与模型配置后台

**R**：你是后端工程师，负责计费口径，要做到与供应商账单对账差异为 0。先读 M4。model_configs 和 credit_ledger 两张表已在 T06 建好并由网关写入，本任务在其上扩展，不重建表、不改写入入口。

**A**

- 模型配置后台：在 T06 的 model_configs 上做增删改页面，改单价只影响之后的调用
- credit_ledger 冲正：提供冲正记录的写入接口（只追加，不改原记录）；失败或被拒的调用按供应商是否实际收费记
- 对账：按供应商、模型、日期导出明细，与供应商控制台用量逐笔核对
- credit\_allocations：制片给组、项目、个人分配积分（本期只记录，不拦截）
- 按天汇总表 credit\_daily，由 worker 每小时增量刷新
- 制片后台页：模型配置、积分分配；明细导出 CSV

**E**

- 用 Mock 数据跑 1000 次调用，导出明细合计与按天汇总合计一致
- 每条流水能通过 node\_id 和 user\_id 追溯
- 非制片角色访问模型配置接口返回 403
- 用真实密钥各跑若干次后，导出明细与方舟、OpenAI 控制台用量逐笔一致

## 阶段 2：画布主体（M5～M7）

这一阶段做完，动画师能在画布上连资产图、填提示词、抽视频、切回历史版本，体验对标 NeoWow 的节点画布。

### T08 画布基础

**R**：你是前端工程师，负责画布内核。先读 M5、docs/poc-canvas.md，复用 PoC 中验证过的渲染策略。

**A**

- 画布列表页（按项目）和画布页；画布数据存 Yjs 文档，服务端以二进制 update 存 canvases 表，每次变更增量保存（防抖 1 秒）
- 命令层 apps/web/src/canvas/commands：addNode、removeNodes、moveNodes、connect、disconnect、updateParams、group、ungroup；所有操作只能通过命令层改 Yjs
- 撤销重做用 Y.UndoManager，支持把多个命令包进一个事务（给 Agent 一轮改动用）
- 交互：平移、缩放、框选、复制粘贴、打组（Ctrl/Cmd+G）、连线、双击空白新建节点（弹类型选择）、删除；快捷键参考 Figma，写 docs/shortcuts.md
- MiniMap 可点击跳转；本地文件拖进画布：调 T05 上传，自动建素材节点
- 剪辑、老板角色画布只读

**E**

- 关闭页面再打开，所有已完成操作都在
- 撤销覆盖上面列出的每一种操作，且「打组」「粘贴 10 个节点」各算一步
- 用 T01 的测试数据，性能不低于 PoC 结论
- Playwright 覆盖：新建节点、连线、撤销、刷新后恢复

### T09 节点注册表与节点类型

**R**：你是前端工程师，在 T08 的画布上建节点体系。先读 M6。

**A**

- packages/shared/nodes 注册表：每种类型定义 inputs（端口名、接受的数据类型）、output 类型、参数 JSON Schema、可用模型（从后端 model\_configs 拉取）
- 节点类型：text（文本/剧本）、llm、image\_gen、video\_gen、media（图、视频、音频）、asset\_ref（先占位，T19 实现）
- 参数面板按 JSON Schema 自动渲染（推荐 @rjsf/core），新增模型参数不改前端
- 连线时校验类型兼容，不兼容时连线变红并提示原因
- 上游输出自动成为下游输入：文本接到提示词口，图片接到参考图口
- 状态角标：生成中、失败、已送审、通过、备选、退回（后几种 T14 接数据，这里先做样式）
- 节点只存参数和 file\_id，不存文件内容

**E**

- 把一张图片素材连到 3 个视频生成节点，3 个节点的参考图口都显示该图
- 音频连到图像参考口被拒绝并提示
- 在后端给某模型新增一个参数，刷新后参数面板自动出现该字段

### T10 生成节点接入网关

**R**：你是全栈工程师，把画布生成节点和 T06 网关接起来。

**A**

- 节点上「生成」按钮：收集上游输入 + 参数，调后端创建任务（幂等键 = 节点 ID + 参数哈希 + 点击时间戳）
- 生成前显示预计积分（来自 estimateCost）
- 误点撤回（3 秒内可取消）：点「生成」后节点显示 3 秒倒计时和「取消」按钮；后端建任务时状态为 scheduled，用 BullMQ 延迟 3 秒才入队发给模型。3 秒内取消直接变 canceled，不调用模型、不记任何积分流水。倒计时由服务端控制，刷新页面不影响
- 3 秒后仍可取消：排队中（还没发给模型）的任务取消后不计费；已发给模型的任务调用适配器 cancel，是否计费按供应商规则记，节点显示「已取消」
- Agent 经确认卡片提交的生成，同样有 3 秒取消窗口
- 订阅 canvas:{canvasId} 房间，任务状态实时更新节点角标和进度
- 成功后结果 file\_id 写回节点当前版本；失败显示原因和「重试」按钮
- 生成记录由服务端保存，不依赖页面是否打开：后端 generation_records 表（只追加；node_id、task_id、提示词、参数、模型、结果 file_id、操作人、提交时间、积分、applied 标记）在任务成功时由 worker 写入
- 离线补取：画布打开时，前端请求 GET /canvases/:id/pending-results，拿到所有未应用到画布的成功记录，通过命令层写入节点后回报 applied；在线时 Socket.IO 推送走同一套应用逻辑，重复应用要幂等
- 乱序规则：同一节点多次生成时，节点当前版本只跟随「最后一次提交」的任务；较早提交但较晚完成的结果只进历史，不覆盖当前版本
- 视频节点默认显示封面，悬停或选中才播放

**E**

- 需求清单 M3「达成效果」4 条全部通过（20 个并发、刷新不丢、失败可重试、拿不到密钥）
- 动画师把角色图连到视频节点生成视频，全流程不需要刷新页面
- 点生成后 3 秒内点取消：任务状态为 canceled，Mock 适配器没有收到任何请求，credit_ledger 没有新增记录
- 排队中的任务点取消，不计费；生成中的任务点取消，调用了适配器 cancel
- 提交 3 个任务后关闭页面，任务全部完成后再打开，3 个结果都在对应节点上
- 同一节点连续提交 A、B 两次，让 A 晚于 B 完成：当前版本是 B，A 出现在历史里

### T11 节点历史与素材对比

**R**：你是前端工程师，负责版本历史和对比。先读 M7。

**A**

- 使用 T10 建好的 generation_records 表，本任务只做界面；节点存 current_record_id
- 节点上历史抽屉：缩略图列表，点击切换当前版本（切换本身是一个可撤销命令）
- 对比视图：选 2～4 个版本或 2～4 个节点；图片用网格，视频用一个主时钟同步播放、同步拖动进度

**E**

- 重抽 5 次后能切回第 2 次结果，撤销能回到第 5 次
- 4 个视频并排播放，拖动进度条后 4 个画面误差不超过 1 帧（按 24fps 计）

## 阶段 3：审核与飞书机器人（M10、M11）

这一阶段做完，画布送审、导演审片、结论回流画布形成闭环，飞书群里既能收到通知，也能直接查进度、审片下结论。

**飞书接入方式定为「企业自建应用 + 长连接」**：服务器只需能出网，不需要公网 IP 或域名，正好适合局域网部署。登录、群消息、私聊、卡片按钮都用同一个自建应用；需求清单里的自定义机器人 webhook 只作为备用通道。

### T12 场、镜头、送审与外部上传

**R**：你是后端工程师，没有单独的审核说明书，审核规则以 docs/requirements.md 的 M10、M11 和本任务书 T12～T18 为准。审核流程：送审后飞书通知导演；导演在飞书卡片上可直接下结论，需要细看时点按钮跳到平台审片页逐帧看、画批。

**A**

- 表：scenes（场号按项目自增、显示名可改、可停用）、shots（镜号按场自增）、review\_versions（场、镜、vN、file\_id、来源 canvas 或 upload、generation\_record\_id、提示词、种子、模型、参考图）
- 版本号在事务里对 shot 加行锁递增
- 画布视频节点「送审」弹窗：场只能从已建的场里选，没有合适的场时可在弹窗里直接新建（需 canvas.use）；镜头选已有或新建；自动带入生成参数
- 外部上传页：只接受 MP4（H.264 编码），复用 T05 断点续传；拖入 MOV 或其他格式直接拒绝，提示「只支持 MP4，请导出 MP4 后再上传」
- 有 canvas.use 权限的人都能建场（导演、执行导演、动画师、制片）；同名场提示但不禁止

**E**

- 两人同时给同一镜头送审，得到 v3、v4，不会出现两个 v3
- 从画布送审的版本，审片页能看到完整生成参数，无需手填

### T13 转码与审片播放器

**R**：你是全栈工程师，负责导演每天用得最多的审片界面，交互参考 Frame.io。

**A**

- worker 把送审视频转 720p HLS，原片保留；转码中显示进度
- 待审队列：按项目、场筛选，按送审时间排序，显示等待时长
- 播放器：hls.js；逐帧（requestVideoFrameCallback，按帧率算步长）、0.25～2 倍速、循环、快捷键（J/K/L、左右方向键逐帧）
- 同镜头多版本 A/B 对比：左右分屏或叠加滑块，同步播放

**E**

- 逐帧前进 24 次，时间码正好前进 1 秒（24fps 素材）
- 500MB 素材转码完成前，审片页显示「转码中」而不是黑屏

### T14 画批、审核结论与回流画布

**R**：你是全栈工程师，完成审核闭环。

**A**

- 画批：任意帧上圈、箭头、自由画 + 文字，存为矢量（坐标按画面比例归一化）+ 帧号；Canvas 叠加层绘制，播放到该帧时显示
- 结论：通过、备选、退回；退回必填原因，可选标签；可改判，改判写 audit\_logs
- 并发：两人同时提交结论，先到先得，后到者收到「已被某某审核」提示（乐观锁 version 字段）
- 回流：结论变化通过 Socket.IO 推到画布，节点角标更新；节点上可直接查看退回原因和画批（只读回放）
- 所有结论变化发出领域事件 review.decided（T16 订阅）

**E**

- 动画师送审后，导演审完，动画师不刷新页面就在节点上看到结论和画批
- 需求清单 M10「达成效果」3 条全部通过

### T15 归档与回收站

**R**：你是后端工程师，负责通过版本落到 NAS 的最后一步。

**A**

- 通过后弹确认框，确认后原片按「场-镜-vN.mp4」移到 to-archive/项目名/，同卷 rename，不复制、不转码（平台内所有视频都是 MP4：模型生成结果为 MP4，外部上传只收 MP4）
- 飞书通过：点「通过」后卡片先变为二次确认（「通过后将归档原片，确认？」+ 确认、取消），确认后才写结论并归档；平台审片页的确认框与之等价，两处走同一个服务方法
- 改判：已归档的版本从「通过」改为备选或退回时，若文件仍在 to-archive，移回平台暂存区并恢复原文件名；若文件已被人从 to-archive 取走，只改状态，写 audit_logs，并通知制片人工处理
- 改判为通过时按上面的规则重新归档
- NAS 离线时状态为「已通过·待归档」，恢复后 worker 自动补归档；失败进队列重试
- 待归档文件超过 20 个时发出事件 archive.backlog
- 回收站保留 7 天，每日清理；项目结项后全项目只读

**E**

- 断开 NAS 后点通过，状态为「已通过·待归档」；恢复后 2 分钟内自动归档完成
- 归档后的文件名为「场-镜-vN.mp4」，放在「待归档/项目名/」下，文件哈希与原片一致
- 外部上传 MOV 文件被拒绝并给出提示
- 在飞书点通过但在二次确认时取消，结论不变、不归档
- 通过并归档后改判为退回，文件回到暂存区，审片页可继续查看

### T16 事件总线与站内通知

**R**：你是后端工程师，建一个统一事件总线，站内通知和飞书推送订阅同一套事件。

**A**

- packages/shared/events.ts 定义事件：review.submitted、review.decided、review.overdue、asset.finalized、stage.advanced、generation.succeeded、generation.failed、archive.backlog、comment.mentioned（P1 预留）
- 事件写 domain\_events 表（outbox 模式）后由 worker 分发给订阅者，保证不丢
- 站内通知：小红点 + 通知列表，按用户已读未读
- 24 小时未审检测：worker 每 10 分钟扫描，超时发 review.overdue（同一版本只催一次，之后每 24 小时再催）
- 每个项目可设一名责任导演

**E**

- 杀掉 worker 后产生的事件，在 worker 重启后全部投递，不重复
- 送审一个版本 24 小时（测试中用可配置的时钟偏移）未审，责任导演收到站内催办

### T17 飞书机器人：群推送与催办

**R**：你是后端工程师，接入飞书自建应用机器人，实现需求清单 M11 的全部推送。

**A**

- 用 @larksuiteoapi/node-sdk；发消息用应用机器人身份（im:message:send\_as\_bot）
- 绑定：组或项目在后台填飞书群 chat\_id 绑定，也可以在群里 @机器人 发「绑定 项目名」（需 member.manage 权限，见 T18）
- 订阅 T16 事件，按 team\_id、project\_id 路由到绑定群；消息用卡片（标题、项目、场镜号、操作人、跳转平台的按钮）
- 催办：群里发卡片并 @ 责任导演，同时私聊 HRBP
- generation.succeeded 这类高频事件合并为每 30 分钟一张摘要卡片；每类事件可在后台开关
- 出网检测失败时自动停用飞书推送并在后台显示原因，其他功能不受影响；备用通道：群自定义机器人 webhook（签名校验）

**E**

- A 组的消息只出现在 A 组绑定的群里
- 断开出网后平台其他功能全部正常，后台显示「飞书不可用」
- 测试中用 Mock 飞书客户端断言每类事件生成的卡片 JSON

### T18 飞书机器人：管理指令与卡片操作

**R**：你是后端工程师，让导演和制片不打开平台也能在飞书里完成常用管理动作。这一任务超出需求清单 v0.1 的 M11 范围，是新增需求，先实现下面列出的范围，不要扩展。

**A**

- 开启长连接，订阅 im.message.receive\_v1（收消息）和 card.action.trigger（卡片按钮回调）
- 身份：飞书 open\_id 或 union\_id 映射到平台用户；每个指令、每次按钮点击都按该用户在对应项目的权限校验，无权限回复「你没有 xx 权限」
- 群内 @机器人 指令（同时支持私聊）：
  - 「待审」：列出当前群绑定项目的待审版本，每条带等待时长和「去审片」按钮
  - 「进度 项目名」：各场镜头的通过、备选、退回、待审数量
  - 「积分 项目名 本周」：本周消耗合计与前 5 名人员
  - 「绑定 项目名」「解绑」：限 member.manage
  - 「帮助」：指令列表
- 送审待审卡片上加按钮：通过、备选、退回，只有该项目有 review.decide 权限的人能操作（导演、执行导演、制片）；点退回弹出卡片表单填原因；结果走 T14 同一个服务方法（并发规则、日志、回流画布全部复用）；下结论后私聊送审的动画师一张结论卡片（结论、退回原因、画批截图、「去画布处理」按钮），动画师只接收并执行，卡片上没有审核按钮
- 点击后 3 秒内响应，并把卡片更新为「已由某某判为通过」，按钮置灰；被别人先审过时提示并刷新卡片
- 回传参数一律用对象格式（SDK 不支持字符串类型）
- 所有飞书侧操作写 audit\_logs，来源标记为 feishu

**E**

- 导演在飞书群点「通过」并完成二次确认，平台审片页、画布节点角标同步变为通过，按 T15 规则归档
- 动画师、剪辑等没有审核权限的人点同一张卡片的「通过」被拒绝，提示无审核权限；导演在飞书退回后，送审的动画师在飞书私聊收到结论卡片
- 两位导演同时点按钮，只有一个结论生效，另一人看到已被审核提示
- 指令响应在本地 Mock 测试中全部覆盖，含无权限、项目不存在、群未绑定三种异常

## 阶段 4：资产库、Agent 与看板（M8、M9、M4）

这一阶段做完，画布具备 NeoWow 式的「资产库 + 画布智能体」能力：一句话拆剧本、自动建节点，公司现有 Skill 可以直接导入使用。

### T19 资产库

**R**：你是全栈工程师，负责项目级资产库。先读 M8。

**A**

- 表：assets（类型：角色、场景、道具、其他；名称、描述、标签、定稿状态、scope 预留 project 或 company）、asset\_versions（设定图 file\_id 列表、描述、版本号）
- 资产库侧边栏：按类型筛选、按名称和标签搜索、缩略图网格
- 画布节点右键「存入资产库」；资产拖到画布生成 asset\_ref 节点，存 asset\_id + version
- 有 canvas.use 权限的人都能新建、编辑资产并标记定稿（动画师负责资产生成和定稿上传，不需要导演额外操作）；定稿发 asset.finalized 事件
- 资产更新版本后，引用旧版本的节点显示「有新版本」提示，点一下升级（可撤销）

**E**

- 动画师搜「林小凡」找到角色，拖进画布连到视频节点作为参考图生成
- 动画师更新设定图后，引用节点出现提示，未升级的节点仍用旧图

### T20 Agent 对话与画布工具

**R**：你是全栈工程师，实现画布右侧的智能体，交互参考 NeoWow 的画布智能体和 updream 的确认卡片。先读 M9。

**A**

- 后端 /agent/chat：SSE 流式输出；LLM 走 T06 网关（计积分）
- 工具集（函数调用）：read\_canvas（选中节点及其上游，返回精简 JSON）、create\_nodes、connect、update\_params、search\_assets、submit\_generation
- 前端执行工具调用：除 submit\_generation 外，工具只产生「待应用的命令列表」，通过 T08 命令层在一个 UndoManager 事务里应用，一轮对话 = 一个撤销单元
- submit\_generation 一律先弹确认卡片（模型、参数、节点数、预计积分），用户确认后才提交；用户拒绝则告诉 Agent 已取消
- 对话记录按画布保存

**E**

- 导入剧本文本节点后，一句话让 Agent 拆出人物、场景、道具，画布上自动出现对应节点并连好线
- Agent 发起任何生成前一定出现确认卡片；拒绝后没有任何生成类积分流水（对话本身调用 LLM 的消耗照常记一条对话类流水，两类在流水里用 usage_type 字段区分：chat、generation）
- 撤销一次回退 Agent 一整轮改动

### T21 Skill 管理与调用

**R**：你是全栈工程师，负责 Skill 体系。Skill 由用户在使用时自行上传，平台和仓库都不预置。

**A**

- Skill 格式：一个 zip 或文件夹，包含 SKILL.md（frontmatter 里有 name、description）和可选的参考文件
- 表：skills、skill\_versions；上传、版本、启用停用；skill.publish 权限（制片）
- 对话框输入「/」弹 Skill 列表；选中后把 SKILL.md 注入系统提示词
- Agent 自动选用：把所有启用 Skill 的 name + description 放进系统提示词，提供 load\_skill 工具，由模型按需加载全文
- 上传入口：Skill 管理页拖拽 zip 或文件夹上传，上传时校验 SKILL.md 格式并预览 name、description，格式不对直接提示原因；不写批量导入脚本

**E**

- 上传 Skill 新版本后，新对话用新版本，旧对话记录里标明当时用的版本
- 在页面上传一个短剧流水线 Skill 后，对话框输入「/」能选中并调用它，产出与 T20 验收相同的画布结果

### T22 积分看板与导演看板

**R**：你是全栈工程师，负责老板、制片、HRBP 看的数据页面。先读 M4，导演看板的数据项以 M4 最后一条为准。

**A**

- 积分看板（ECharts）：按组、项目、人员、模型、时间段看消耗；只读 credit\_daily 汇总表
- 导演看板：待审积压、平均审核时长、24 小时超时次数、通过/备选/退回分布、退回 3 次以上的镜头；支持本周、本月、自定义时间段
- 下钻：从导演到镜头列表，再到审片页
- 老板、HRBP 全局只读；制片看自己负责的组

**E**

- 看板数字与明细导出逐项一致
- 10 万条流水下，看板首屏加载不超过 2 秒

## 阶段 5：联调验收与 P1

### T23 端到端验收与部署交付

**R**：你是 QA 兼运维工程师，目标是让制片能按需求清单的「达成效果」逐条验收。

**A**

- 把需求清单 M1～M11 每条「达成效果」写成 docs/acceptance.md 的勾选清单，每条标注对应的自动化测试或手工步骤
- 补齐 Playwright 主流程：飞书（Mock）登录 → 建画布 → 连资产生成视频 → 送审 → 导演审片退回 → 动画师重抽再送审 → 通过 → 归档 → 飞书卡片收到结论
- 内网部署手册 docs/deploy.md：服务器要求、NAS 挂载、出网白名单（模型 API 域名、open.feishu.cn）、飞书自建应用配置步骤与权限清单、备份恢复演练
- 压测：20 人同时在线、每人 5 个生成任务
- 使用测试时执行目标机画布性能验收：16 GB 内存、集显、Chrome，沿用 docs/poc-canvas.md 的复现方法，记录平移、缩放、框选 50 节点拖动的平均/最低 FPS、首屏和内存；保留机器配置和原始记录。

**E**

- 在一台全新内网服务器上，按 docs/deploy.md 30 分钟内完成部署
- docs/acceptance.md 中自动化条目全部通过，手工条目附截图
- 从备份恢复数据库后数据完整
- 目标机 Chrome 平移与缩放平均不低于 45 FPS，Yjs 加载至首屏不超过 3 秒，同时播放视频不超过 4 个；不达标需定位瓶颈和整改后复验，不以独显开发机结果替代。

### P1 任务（内测 1.1，届时按同一格式展开）

| 编号 | 任务 | 要点 | 依赖 |
| --- | --- | --- | --- |
| T24 | 实时协作 | 加 Hocuspocus 协作服务，Yjs awareness 同步光标；断网重连自动合并 | T08 |
| T25 | 流程模板 | 选中节点存为子图 JSON，参数用占位符；套用时生成新 ID | T09 |
| T26 | 批量生成 | 批次为父任务，单个失败不影响其他；提交前显示预计总积分 | T10 |
| T27 | 评论与 @ | 评论挂节点 ID；@ 走 T16 事件，飞书私聊被 @ 的人 | T16、T17 |

## 开工前需要确认

以下几项会直接改变任务内容，T00 开工前定下来：

- [ ] 后端语言：本任务书按 TypeScript 全栈写（已定）
- [ ] 第一批接入模型清单（LLM、图像、视频各几个，供应商和型号），见 T06 附表（型号已核对，已定）
- [ ] T01 的性能门槛（平均 45 FPS、首屏 3 秒）已确认（已定），作为 PoC 验收标准
- [ ] 飞书自建应用由 carrotryuu 申请并负责审批上线（已定）；需开通的权限：机器人、im:message、im:message:send\_as\_bot、contact:user.base:readonly、卡片回传交互。权限按任务分批开：T03 开登录和通讯录基本信息，T17 开机器人和以机器人身份发消息，T18 开收消息事件和卡片回传交互，均由 carrotryuu 在该任务联调前开通
- [ ] T18 飞书内直接下审核结论：允许，通过、备选、退回都可在飞书下，仅限有审核权限的导演、执行导演、制片；动画师只接收结论并执行（已定）
- [ ] 公司现有 Skill ：不预置，由用户使用时在页面自主上传（已定）
- [ ] （已确认：公司有出网限制，可按需放行；到 T02、T06、T17 真实联调前，由 carrotryuu 按 PR 里列出的地址找网管开通）服务器出网白名单由 carrotryuu 配置（已定）：ark.cn-beijing.volces.com、公司 OpenAI 线路地址、结果文件下载域名、open.feishu.cn 及飞书长连接域名
- [ ] 白名单补充项：NTP 时间服务器；npm、Docker 镜像仓库（或改为离线构建镜像再拷进内网）；飞书头像 CDN（建议登录时把头像下载到 NAS，之后不再外链）
- [ ] 出网若走公司代理：Node 默认不读 HTTPS\_PROXY 环境变量，T06、T17 要显式配置代理；飞书长连接是 WebSocket，代理必须支持
- [ ] 参考素材怎么给模型：服务器在内网，模型方访问不到平台的签名链接。参考图可用 base64，但参考视频、音频大概率要先传到模型方能访问的对象存储（如火山 TOS），需确认是否开通，影响 T06

## 来源

- [飞书 SDK：使用长连接接收回调](https://open.larkoffice.com/document/uAjLw4CM/ukTMukTMukTM/server-side-sdk/golang-sdk-guide/handle-callback.md)：长连接无需公网 IP，回传参数仅支持对象类型
- [飞书：接收与处理回调](https://open.larkoffice.com/document/uAjLw4CM/ukTMukTMukTM/event-subscription-guide/callback-subscription/receive-and-handle-callbacks.md)：回调须 3 秒内响应
- 《AI视频无限画布 · 开发需求清单 v0.1》（用户提供）
