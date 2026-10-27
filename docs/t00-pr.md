# T00：建立可启动的工程与基础设施健康检查

从空工作区建立 pnpm 单仓，包含 React/Vite 前端、NestJS API、BullMQ worker 和共享类型包。API 对数据库、Redis、NAS 分别检测；例如 PostgreSQL 不可达时返回 503 和 database=down，其余依赖状态仍独立返回，服务继续运行并可在依赖恢复后返回 200。

提供五服务 Docker Compose、Nginx API 反代、包含 FFmpeg 的 worker Dockerfile、环境变量示例及两套启动说明。无业务表、模型调用、飞书调用和业务页面。

## 验证

- lint、typecheck、8 项 Vitest 测试、生产构建、Prisma schema 校验通过。
- Chrome、Edge 各 2 项 Playwright 测试通过，针对实际容器站点并设置 E2E_REQUIRE_HEALTHY=1，确认页面与 API 代理正常。
- Docker Desktop 4.97.0、WSL 3.0.3 已安装并在重启后运行；五服务构建启动、三项健康正常、PostgreSQL 停止后 503/down 及恢复后 200/ok 均通过。worker 容器 FFmpeg 5.1.9 可运行，队列连接 ready。
- 未执行云端 CI；工作流文件已准备。

## 待确认/环境前提

- 本机原 Docker AppData 配置文件替换失败，采用项目 `.local/docker-profile` 独立运行目录；使用 start-local.cmd 启动，不修改全局环境变量。该目录包含活动数据，不可当临时文件删除。
- 用户授权以当前项目替换仓库原内容。原 main 仅有 AGENTS.md 和需求文档；本次用最新确认版本与已验收 T00 工程更新，保留原 Git 历史及备份分支。工作分支为 codex/t00-scaffold。

## 待开通权限

T00 无飞书权限需求。

## 待放行地址

构建依赖 npm registry、Docker 镜像仓库及 Debian 软件源；可在联网构建机打包镜像后离线导入。模型 API 与飞书业务放行留到对应任务。
