# AI 视频无限画布

当前已交付 T00 工程脚手架，并实现 T01 画布性能 PoC。前端首页可进入 `/poc/canvas`；后端只提供基础设施健康检查；worker 只初始化队列连接。业务开发以 docs/tasks.md、docs/decisions.md 和 docs/progress.md 为准。

在当前 Windows 电脑上，双击根目录的 `start-local.cmd` 可启动 Docker 和项目，等待健康检查通过后打开浏览器。首页链接进入 150 节点的性能验证画布；此页面刷新后重置，不是正式业务画布。

T01 的机器配置、三轮实测、测量限制和复现步骤见 [画布性能报告](docs/poc-canvas.md)。目标机测试按用户决定移到 T23 使用测试，45 FPS / 3 秒门槛不变。

本机原 AppData 下 Docker 配置的原子重命名失败（Win32 错误 17），因此 Docker 使用 `.local/docker-profile` 独立运行目录。此目录包含 Docker 配置与运行数据，**不是安装残留，不要删除**。启动脚本只对 Docker 子进程设置 APPDATA/LOCALAPPDATA，不更改系统全局环境。重启电脑后请使用此脚本启动本项目，避免从旧入口再次使用出错的目录。

## 开发环境

- Node.js 22.12+（支持 22/24），pnpm 10.11.0，Git。
- Docker Engine/Desktop 与 Compose 2.20+；Linux 容器。
- PostgreSQL 16、Redis 7 可由 Docker 提供。只有完整部署验收需要构建全部容器。
- NAS 目录必须实际存在且可写。正式环境由管理员挂载 NAS，不能用自动创建本地目录掩盖挂载失败。

安装 pnpm：`npm install -g pnpm@10.11.0`。

## 本地开发

在仓库根目录执行：

```powershell
Copy-Item .env.example .env
New-Item -ItemType Directory -Force .local/nas
```

编辑 `.env`：`NAS_ROOT` 填刚才目录的绝对路径（Windows 示例 `D:/infinite-carrot/.local/nas`）；修改 POSTGRES*PASSWORD，并同步修改 DATABASE_URL 中的密码。密码使用 URL 安全字符，推荐长随机十六进制串。服务端密钥禁止使用 `VITE*` 前缀。

```sh
pnpm install --frozen-lockfile
docker compose --env-file .env -f deploy/docker-compose.yml -f deploy/docker-compose.dev.yml up -d postgres redis
pnpm dev
```

访问 `http://localhost:5173`；`http://localhost:5173/api/health` 通过 Vite 转发到后端 `/health`。SERVER_PORT 默认 3000，Vite 端口固定 5173。`pnpm dev` 先构建共享包，再同时启动前端、API 和 worker。修改共享包后重新运行此命令。

Linux/macOS 使用 `cp .env.example .env` 和 `mkdir -p .local/nas`，其余命令相同。

## 测试与构建

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:validate
pnpm exec playwright install chrome
pnpm e2e
```

Vitest 的接口测试替换基础设施探针，覆盖健康、故障、恢复、超时和错误信息隔离；NAS 探针测试实际创建并清理临时文件。Playwright 启动本地开发服务，检查页面和 API 代理；未启动数据库等依赖时允许健康接口返回 503。完整健康验收设置 `E2E_REQUIRE_HEALTHY=1`。外部模型与飞书默认 `MOCK_EXTERNAL=1`，T00 不调用它们。

浏览器测试默认使用已安装的 Chrome；如已有 Chrome，无需再次执行安装命令。设 `PLAYWRIGHT_CHANNEL=msedge` 可测试已安装的 Edge，终端环境变量优先于 `.env`。T01 校验 H.264 解码，CI 同样使用正式 Chrome，不使用缺少相应媒体编解码器的默认 Chromium。

T00 没有业务表，Prisma 只配置数据源与迁移目录；健康检查使用 PostgreSQL 驱动执行 `SELECT 1`。后续业务必须通过 Prisma migration 建表。`pnpm db:migrate:dev` 创建开发迁移，`pnpm db:migrate` 部署已有迁移。`pnpm db:seed` 在 T00 明确报未实现，不伪造演示数据；T03/T04 再加入种子用户与组织。

## 内网部署

1. 准备 Linux 服务器、Docker Compose 2.20+、NAS 挂载和仓库文件。
2. 复制 `.env.example` 为 `.env`，设置强 POSTGRES_PASSWORD 和 NAS_ROOT 绝对路径。容器内 server/worker 用 UID/GID 1000，NAS ACL 必须允许该身份写入。不要对整个 NAS 递归改权限。
3. 构建需要 npm 包仓库、Docker 镜像仓库、Debian 软件源。受限内网可在联网构建机执行 `docker compose build`，并拉取 postgres/redis 镜像，再使用 `docker save` / `docker load` 导入。真实模型与飞书放行留给相应任务。
4. 在根目录执行：

```sh
docker compose up -d --build
docker compose ps
```

等价显式命令为 `docker compose --env-file .env -f deploy/docker-compose.yml up -d --build`。容器间使用 postgres/redis 服务名；Compose 会覆盖容器内的 DATABASE_URL、REDIS_URL、NAS_ROOT，宿主机的 .env 则用于本地开发和挂载来源。

访问 `http://localhost`（或服务器 IP）。WEB_PORT 可改端口。仅 web 暴露端口，数据库和 Redis 默认不暴露到局域网。server/worker 作为非 root 用户运行，worker 镜像包含 FFmpeg。Nginx 转发 `/api/*` 并支持流式响应及连接升级。

健康接口正常时返回 200：

```json
{ "status": "ok", "database": "ok", "redis": "ok", "nas": "ok" }
```

任一依赖故障时返回 503，对应项为 down，其余项仍独立检测；响应不包含连接字符串、密钥或 NAS 路径。NAS 探针写入临时文件后删除，不创建缺失的挂载目录。

## T00 部署验收

只在隔离的测试部署执行，脚本会短暂停止本项目 PostgreSQL 并在 finally 中恢复：

```sh
node scripts/verify-compose.mjs
```

脚本验证首页、三项健康、停库后的 503/database down，以及启动数据库后恢复 200。使用非 80 端口时设置 E2E_BASE_URL，例如 `http://localhost:8080`。

检查 FFmpeg：`docker compose exec worker ffmpeg -version`。查看日志：`docker compose logs --tail 100 server worker`。停止服务：`docker compose down`（保留数据卷）；不要使用 `down -v` 删除数据。

## 仓库结构

- apps/web：React 18 + Vite + TypeScript。
- apps/server：NestJS API、Prisma 迁移目录。
- apps/worker：BullMQ 异步任务进程。
- packages/shared：共享类型、zod 环境变量与响应校验。
- deploy：Dockerfile、Compose、Nginx。
- docs：原始需求、补充决定、任务与实际进度。

T00 不涉及飞书权限或模型 API 放行；模型 ID、凭据和业务实现留给各自任务。
