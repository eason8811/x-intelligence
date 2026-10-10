# X 终端登录

`pnpm x:auth` 已替换为固定版本 twitter-monitor Web HTTP 登录，不启动 Playwright。无需图形桌面或安装 Chromium，需要交互终端。

## 使用

```bash
pnpm install --frozen-lockfile
pnpm x:auth
pnpm x:collect:probe --count 10 --pages 1
```

工具只尝试一次获取 guest token，启动 Login，按服务端返回的单项 subtask 执行 JS instrumentation、用户名、补充标识、密码、账号检查、验证码及验证方式选择。未知任务或多任务响应停止，不自动猜测或重试。最多 20 步、整体 15 分钟，Ctrl+C 取消；已发请求沿用上游 30 秒超时，可能在取消后才结束。

密码和验证码在终端隐藏输入，仅用于请求，不保存或输出。LoginAcid 可能要求不同验证信息，不能假定总是邮箱验证码。不收集 TOTP secret。不支持浏览器安全密钥交互、验证码绕过或未知登录挑战。

LoginSuccessSubtask 后请求 Viewer，检查用户 ID、用户名和两项 cookie，要求用户确认账号后保存。已有文件启动时另需确认覆盖，失败保留旧会话。

## 文件

仍保存到被 Git 忽略的 `playwright/.auth/x.json`，使用现有原子替换和私有权限。新文件为 cookie-only 的 storageState 兼容结构：auth_token、ct0、origins 空数组。expires=-1 表示未保存真实服务端到期时间，不代表会话永不过期。失效需重新登录。旧浏览器文件保持可读。

不保存密码、验证码、guest token 或 flow token。Linux/macOS 文件 600、目录 700；Windows 使用当前用户受保护目录。没有数据库或 AI 写入。

## 上游兼容边界

原始 HTTP/TLS、代理环境变量和超时保留。选择验证方式时通过上游 postFlowTask 提交完整 cookie，避免 LoginTwoFactorAuthChooseMethod 中 att._twitter_sess 的字段错误。JS instrumentation 仍使用上游解析与 MockDocument，但先检查返回错误，不在失败后继续提交空结果。没有修改这些上游源文件。

本项目 CLI 不复制上游示例的固定步骤或未定义 loginCheck，而按服务端响应调度。GuestToken 类的十次重试被绕开，使用底层 getToken 一次。未知响应明确失败。

## 验证

离线测试覆盖分支、隐藏输入标记、Viewer 验证、取消、流程错误、步数限制、原子保存和原始模块加载。它们不能证明真实账号能登录、JS instrumentation 当前有效、Viewer 查询配置仍有效或全部 2FA 方式可用。真实验收需要你在本地交互终端完成一次登录并执行一页探针。

## Guest 初始化错误诊断

AUTH_GUEST_NETWORK_FAILED 表示允许列出的网络或 TLS 错误；AUTH_GUEST_HTTP_FAILED 表示首页或静态资源 HTTP 拒绝；AUTH_RATE_LIMITED 表示 HTTP 429；AUTH_GUEST_PARSE_FAILED 表示没有捕获到上述错误且未取得完整上下文，可能为页面/脚本变化或未分类错误，不等于已证明解析器故障。只输出阶段、HTTP 状态和允许列出的网络码，不输出原始异常或正文。Guest 请求通过原始 axios-helper 创建实例，注入响应诊断 interceptor，保留超时、TLS、User-Agent 和代理配置。

上游首页缺少 guest_token 或 ondemand_s_hex 时 reject 后仍继续调度静态资源请求，旧阶段日志可能误导。AUTH_GUEST_PAGE_FIELDS_MISSING 根据上游明确失败原因定位首页，并只显示字段是否识别；AUTH_GUEST_COOKIE_PARSE_FAILED 表示首页 cookie 脚本模式未识别。这些错误不能单凭日志区分页面结构变化、跳转页面或访问限制，需继续验证。

Guest 初始化修复：默认改用上游已有 getToken(1, "api") 的 POST /1.1/guest/activate.json 路径，避免 Web 首页/ondemand.s 解析前置依赖。不做失败自动切换或重试；保留原始 Axios/TLS/代理行为。已在开发环境验证 API guest 初始化成功（HTTP 200），并复现 Web 路径首页两字段未识别；这不是 Windows 代理环境或完整账号登录验收。后续 JS instrumentation 与 Viewer 仍需真实登录验证。
