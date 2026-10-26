# AI 视频无限画布

公司内网短剧／漫剧生产平台。当前仅包含 T00 脚手架：空白首页、健康检查、worker 进程和部署配置。需求以 `docs/decisions.md`、`docs/requirements.md`、`docs/tasks.md` 为依据。

## 环境

- Node.js 24、pnpm 11.25.0、Docker Engine / Docker Desktop（Linux 容器）、Docker Compose。
- PostgreSQL 16、Redis 7 由 Compose 提供。worker 镜像包含 FFmpeg。
- 浏览器：Chrome、Edge。时间统一存 UTC，后续业务界面按 Asia/Shanghai 显示。

## 本地开发

在仓库根目录复制 `.env.example` 为 `.env`，将 `NAS_ROOT` 改为现有的**绝对目录**。Windows 示例 `D:/infinite-carrot/.data/nas`；Linux 示例 `/srv/infinite-carrot/nas`。创建目录并保证运行用户可读写。Linux 容器运行用户 UID 为 1000，NAS 挂载需授予该用户权限。

```sh
pnpm install --frozen-lockfile
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.dev.yml up -d postgres redis
pnpm dev
```

访问 `http://localhost:5173`（空白首页），`http://localhost:5173/api/health`（通过 Vite 代理）；后端直接地址为 `http://localhost:3000/health`。`pnpm dev` 同时启动前端、后端、worker 和共享类型编译。更换本地数据库密码或端口时须同步修改 `.env` 中 `DATABASE_URL`。

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

测试默认 `MOCK_EXTERNAL=1`；不调用飞书和模型 API。T00 不建业务表、不生成演示账号；Prisma schema 和迁移入口已预留，业务模型与 seed 在后续任务加入。`pnpm db:migrate` 在加入模型后使用，不在 T00 执行空迁移。

## 内网部署

1. 同样准备 `.env` 和 NAS 绝对路径。正式环境修改数据库默认密码（建议使用随机字母数字，避免连接串转义问题）。
2. 从仓库根目录执行下列命令。`.env` 中 `COMPOSE_FILE` 指向部署文件，因此可直接使用 `docker compose`。

```sh
docker compose up -d --build
docker compose ps
```

访问 `http://localhost` 或服务器内网地址，首页为空白。`/api/health` 正常返回：

```json
{ "status": "ok", "checks": { "database": "ok", "redis": "ok", "nas": "ok" } }
```

任一依赖不可用时返回 HTTP 503 和对应 `down` 状态，不返回连接串、密钥、NAS 路径。数据库、Redis 在部署配置中不暴露宿主机端口。T00 的 NAS 检查仅验证目录存在、可读写，不替代 T05 的挂载在线检测。

故障验收（仅验收环境）：

```sh
docker compose stop postgres
# 请求 /api/health：database=down，其余仍为 ok，服务继续响应。
docker compose start postgres
# 再请求 /api/health：三项恢复 ok。
docker compose exec worker ffmpeg -version
```

也可在验收环境运行 `node scripts/verify-deploy.mjs`，自动检查首页、健康接口、FFmpeg、PostgreSQL 停机及恢复。脚本会短暂停止本项目数据库，结束时自动启动恢复。

停止服务使用 `docker compose down`，数据库与 Redis 命名卷保留；不要使用 `down -v` 删除数据。

内网无构建出网权限时，应在获准联网的构建机执行 build，导出三个应用镜像及 postgres、redis 镜像，拷入内网后 `docker load`，再运行 `docker compose up -d --no-build`。镜像名以 `docker compose config --images` 为准；构建机与内网保持相同 `COMPOSE_PROJECT_NAME`。

T00 联网构建需要 npm 仓库、Docker 镜像仓库、Debian 软件源和 Prisma 引擎下载地址；后续模型和飞书联调权限按任务申请。本阶段没有外部业务 API 密钥。

## 结构

- `apps/web`：React + Vite 前端
- `apps/server`：NestJS API 和 Prisma schema
- `apps/worker`：异步任务进程底座
- `packages/shared`：共享类型
- `deploy`：Dockerfile、Compose、Nginx
- `tests/e2e`：Playwright 主流程测试

构建参考：[pnpm Docker 文档](https://pnpm.io/docker)、[NestJS 部署文档](https://docs.nestjs.com/v11/deployment)。
