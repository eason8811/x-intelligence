# X 人工登录与会话存储

## 当前入口

运行 `pnpm x:auth`。命令启动本地可见的 Patchright Chromium，打开 X 登录页；用户在浏览器中手动完成密码、验证码或页面要求的验证。程序不会读取或自动填写这些凭证。

完成后，用户进入 `https://x.com/home` 并回到终端确认。程序检查当前 URL 及当前浏览器上下文中的 `auth_token`、`ct0` Cookie，再要求输入一个仅用于区分会话的账号名并二次确认。已存在的 `x-primary` 会话只有在确认后才会被新登录替换；取消、超时或校验失败会保留原记录。

登录最多等待 15 分钟。未知页面、没有必需 Cookie、数据库错误或浏览器错误都会停止；程序不会自动重试，也不会输出 Cookie、请求头或原始异常。

## 数据库保存内容

Patchright 的 `BrowserContext.storageState({ indexedDB: true })` 作为整体会话保存，包含当前浏览器上下文中的 Cookie、localStorage，以及浏览器支持时的 IndexedDB。X 返回的 `auth_token`、`ct0`、`twid`、`gt`、`guest_id` 等 Cookie 会按本次登录实际存在情况记录；当前实现只把有效的 `auth_token` 和 `ct0` 作为保存门槛，不硬编码其他 Cookie 必须存在。

会话以 AES-256-GCM 加密后存入 PostgreSQL 的 `x_auth_session` 表。数据库保留会话标签、加密版本、nonce、ciphertext、authentication tag 和时间字段；密钥来自 `X_AUTH_ENCRYPTION_KEY`，必须是 32 字节随机数的 Base64 编码，不能存入数据库、Git 或公开配置。`loadXAuthState` 提供解密入口，后续 Collector 可将结果传给 `browser.newContext({ storageState })` 复用。

实现不会录制或保存 HAR、登录请求正文、密码、验证码或完整请求头。历史采集中观察到的 `x-client-transaction-id`、`$castle_token`、`prelude_dispatch_id` 属于请求或流程上下文，不是稳定账号会话；正常浏览器会在需要时按当前页面流程产生它们，不应从历史值回放。公共应用 `Authorization` 配置也不属于账号 Cookie，不写入账号会话。

## 本地准备

1. 在根目录 `.env` 配置 `DATABASE_URL`。
2. 为 `X_AUTH_ENCRYPTION_KEY` 配置独立的 32 字节 Base64 随机密钥，例如本机生成后写入未跟踪的 `.env`：

   ```sh
   openssl rand -base64 32
   ```

3. 先审阅新增 migration，再对目标数据库执行 `pnpm db:migrate`。
4. 安装 Patchright Chromium：

   ```sh
   pnpm --filter @x-intelligence/collector exec patchright install chromium
   ```

5. 启动 `pnpm x:auth`，在打开的浏览器窗口中完成登录。

## 页面变更时的诊断

登录页面、登录后首页或 Cookie 规则变化时，不要把 Cookie 值、密码、验证码或完整 HAR 粘贴到聊天或提交到仓库。可重新运行 `pnpm x:auth` 并在正常浏览器中完成一次登录；如保存校验失败，只提供错误代码、最终 URL 的路径部分和必需 Cookie 的名称/是否存在。若需要 HAR 做进一步调查，应留在私有本地目录并先移除请求正文、Cookie 值和认证头。

账号名由操作者在终端输入，仅作为数据库会话标签；目前没有额外的远端账号身份 API 校验。登录后请核对浏览器中显示的账号，再确认保存。
