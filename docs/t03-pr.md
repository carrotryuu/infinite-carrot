## 问题与结果

此前项目没有登录与账号状态。T03 新增飞书 OAuth 适配器和 Mock 登录：首次登录建立唯一 union_id 身份并显示“等待管理员分配”，重复登录同步姓名/头像；会话存 Redis，浏览器仅持有七天 HttpOnly Cookie。退出删除会话；停用账号递增会话版本，下一次请求返回 401，重新启用也不会恢复旧会话。

本任务不开放注册，不提供 T04 的角色、分组或账号管理页面。七个 Mock 名称仅区分演示身份，未授予同名角色。停用服务要求 account.manage，供 T04 调用；不暴露未鉴权的停用接口。

## 验证

- Vitest 覆盖首次并发登录去重、重复登录、七天 Cookie、退出、停用/恢复旧会话失效、跨站请求、过期会话、OAuth state 单次使用与浏览器绑定、PKCE、企业校验和密钥错误脱敏。
- Playwright 覆盖登录、待分配、刷新、退出以及真实停用后 401 跳转。最终本机与 CI 结果见 docs/progress.md。
- 真实飞书账号登录尚未执行，因此 PR 保持草稿。

## 待开通权限

- 企业自建应用开启网页应用能力，发布到测试人员可见范围，配置 HTTPS 回调 `{部署域名}/api/auth/feishu/callback`。
- 网页登录授权读取当前登录用户的 union_id、姓名、头像和 tenant_key。控制台权限名称及是否需要额外基础信息 scope 在真实联调前核对；本实现不申请手机号、邮箱、全量通讯录或离线访问权限。
- 事件订阅：本任务无；本地账号停用由平台服务处理，不宣称同步飞书企业离职事件。
- 服务端配置 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_TENANT_KEY、FEISHU_REDIRECT_URI。真实联调须由 carrotryuu 确认开通，不向聊天或 Git 提交密钥。

## 待放行地址

- 浏览器：`accounts.feishu.cn:443`（登录授权）。登录页面可能依赖的静态资源域名由网管依据实际浏览器失败请求补充。
- 服务端：`open.feishu.cn:443`（授权码换 token、获取当前登录用户）。
- 登录头像域名依据实际返回 URL 核对；不预先放行宽泛通配符。
- 公司部署站点的 HTTPS 地址需对测试浏览器可达，回调无需将内网服务开放给公网服务器。

## 待确认与后续

- 真实应用可用权限及 PKCE/OAuth 协议需在获准后实测。官方协议入口：[授权码](https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code)、[token](https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token)、[用户信息](https://open.feishu.cn/document/server-docs/authentication-management/login-state-management/get)。目前是模拟协议测试，不能冒充真实授权成功。
- 身份使用独立组织身份分区 team_id，不表示业务组归属；T04 的 memberships 决定业务 TeamScope。T04 才增加两组、三项目和正式角色种子。
- T02 已按用户要求合并，真实模型测试待放行后补做；进入 T06 时提醒，已写入 tasks.md 和 decisions.md。
