## 变更与验收

建立 T00 单仓脚手架及五服务部署：React 空白首页、NestJS 健康接口、worker、PostgreSQL、Redis，worker 镜像包含 FFmpeg。数据库故障时健康接口返回 503 和逐项状态，恢复后可重新报告正常。

包含共享类型、Prisma 空 schema、strict TypeScript、lint/格式化、Vitest + supertest、Playwright、CI、环境变量示例、本地开发与内网部署说明。未创建业务表或业务页面。

- 已通过：`pnpm lint`、`pnpm typecheck`、`pnpm test`（4 项）、`pnpm build`、`pnpm e2e`（1 项）。
- GitHub CI 已通过五服务部署、首页及健康接口、FFmpeg 检查、数据库停机后 `down` 和重启后恢复 `ok`：[运行记录](https://github.com/carrotryuu/infinite-carrot/actions/runs/40315959553)。
- 本机 C 盘空间为 0，Docker 构建缓存出现 I/O 错误后无法启动，本地容器验收未完成；上述容器验收在 GitHub Linux runner 上完成。

## 待确认

T00 无新增业务需求待确认。内网部署时需填写实际 NAS 绝对路径和数据库密码。

## 待开通权限

T00 不需要飞书或模型 API 权限。

## 待放行地址

在线构建使用 registry.npmjs.org:443、registry-1.docker.io:443、auth.docker.io:443 及镜像下载重定向域名、deb.debian.org:80/443、binaries.prisma.sh:443；浏览器测试安装可能需要 cdn.playwright.dev:443 及下载重定向域名。内网可采用 README 中的离线镜像导入流程；尚未验证公司内网放行。
