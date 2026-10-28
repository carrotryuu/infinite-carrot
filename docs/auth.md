# T03 登录与账号

当前默认 `MOCK_EXTERNAL=1`。访问 `/login` 选择七个演示身份之一，登录后进入待分配页；`/account` 显示当前姓名/头像与退出按钮。演示姓名不是权限授予，所有首次账号都等待 HRBP 分配。T04 才实现实际角色和组。

## 本地运行

执行 `pnpm db:generate`、`pnpm db:migrate`、`pnpm db:seed` 后 `pnpm dev`。种子命令只准备七个 Mock 身份，不创建组或项目，也不会重新启用已停用账号。重复运行不会重复建号。

开发地址默认 `AUTH_PUBLIC_ORIGIN=http://127.0.0.1:5173`。容器使用独立的 `AUTH_DEPLOY_ORIGIN=http://127.0.0.1`，端口或域名变化时同步配置完整 origin；登录与退出 POST 严格检查 Origin。真实模式必须 HTTPS，Mock 本机允许 HTTP。

## 会话与边界

Cookie 名为 carrot_session，HttpOnly、SameSite=Lax，HTTPS 时加 Secure。随机 256 位令牌只在 Cookie，Redis 保存其 SHA-256 索引、用户 ID 和会话版本，固定七天过期，不自动续期。用户访问 `/auth/me` 时从数据库复核 active 和版本，因此停用后所有旧会话立即失效；启用时再次增加版本，旧 Cookie 仍无效。Redis 不可用时不会退回不安全的匿名身份。

OAuth state 有十分钟 TTL，绑定浏览器 HttpOnly Cookie，并使用 GETDEL 单次消费；同时使用 PKCE S256。授权码只在服务器交换，token 不持久化、不下发前端；只接受配置企业 tenant_key 的用户。授权失败统一显示可重试错误，不展示供应商响应和密钥。

users 的 team_id 是固定的组织身份分区，tenant_id 预留为空。IdentityRepository 的私有 TeamScope 客户端只供身份服务使用，不把身份分区当作业务组。T04 需用 memberships 构建实际用户范围；其他业务不得直接复用该分区绕过组隔离。用户创建、资料同步与停用写审计，禁止删除历史账号。

PoC 页面仍是隔离测试入口，并未改成正式业务画布或绑定账号权限。T04 后的正式接口必须接入 SessionGuard 和真实权限点，不能把 Mock 固定组视为正式授权。

## 验证与真实联调

设置 `AUTH_INTEGRATION_TESTS=1` 并加载 `.env` 后运行 Vitest，使用真实 PostgreSQL/Redis。Playwright 同一开关会执行真实账号停用测试，测试最终恢复该演示账号。对 Docker 运行此测试需仅在本机启用 dev overlay 的回环数据库端口；测试后恢复普通 Compose 即可。

真实联调前必须按 AGENTS.md 第 11、12 条停下。权限、事件与域名见 docs/t03-pr.md。确认后配置企业参数、HTTPS origin 和回调，再将 `ALLOW_REAL_FEISHU=1`、`MOCK_EXTERNAL=0`。请注意 MOCK_EXTERNAL 是全局开关；真实飞书验收时应关闭 `POC_GATEWAY_ENABLED`，避免同时启动尚未获准的真实模型网关。尚未完成真实飞书验收，不因 Mock 通过而认定 T03 全部完成。
