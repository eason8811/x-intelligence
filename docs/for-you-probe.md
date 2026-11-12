# For You 本地只读探测

## 运行前提

先运行 `pnpm x:auth:verify`，在新打开的 Chrome 中确认展示的是目标 X 账号。探测命令随后从 `DATABASE_URL` 对应的 PostgreSQL 读取并解密同一条 `x-primary` 会话；`DATABASE_URL` 与 `X_AUTH_ENCRYPTION_KEY` 必须和保存登录态时一致。

探测只在内存中提取 `auth_token` 和 `ct0`，调用固定上游 `BANKA2017/twitter-monitor` commit `dd8de94e3e2853beb7b5e5b785f1908c2cafea4b` 的 `postHomeTimeLine`。HomeTimeline 的路径、queryId、features 和 `fieldToggles` 已按 2026-11-11 用户提供的首屏请求做本地适配；不保存或复放 Cookie、Authorization、CSRF、transaction ID 或该次请求中的 `seenTweetIds`。原始 HTTP/TLS 行为与必要的本地兼容补丁见 [`PROVENANCE.md`](../packages/x/src/twitter-monitor/vendor/PROVENANCE.md)。探测不写 `x_post`、`feed_run` 或其他业务表，不调用 Jev，不启动 Cron，不自动重试。

## 执行

默认只请求一页。若要与所记录的网页首屏请求对照，显式传 `count=20`：

```bash
pnpm x:collect:probe --count 20 --pages 1
```

参数范围为 `count=1..20`、`pages=1..3`。`count` 是传给上游的请求值，实际返回条数由 X 决定。建议先审阅这一页，再决定是否请求最多三页观察游标与跨页去重。

## 结果与验证边界

结果写入 Git 忽略的 `debug-artifacts/x-probe/<uuid>.json`。文件包含帖子内容、作者、时间、媒体 URL、分页游标和 `entryId` / `sortIndex` 证据，不包含 Cookie；它仍属于账号可见数据，应留在本机私有目录，不提交或公开。

输出里的 `position` 和上游 `entryId` / `sortIndex` 只记录本次 HTTP 响应顺序，`orderVerified` 固定为 `false`。请在相近时间人工对照同账号的 X For You 首页，核对帖子、字段和顺序。一次成功响应只证明本次请求可用，不能证明稳定分页或长期有效；离线检查也不能替代这次真实账号探测。
