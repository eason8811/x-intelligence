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

## 手动持久化采集

探测结果确认可用后，可通过独立命令创建一次数据库采集运行。它使用同一加密会话和采集源，将帖子幂等写入 `x_post`，按本次顺序写入 `feed_observation`，创建尚无分类记录的 `PENDING` 项，并更新 `feed_run` 成功/失败状态。一次运行先记录为 `RUNNING`；帖子、观察记录、分类占位和成功状态在同一数据库事务中提交。失败时只把安全错误码写入运行记录。

```bash
pnpm x:collect:run --count 20 --pages 1
```

默认参数为 `count=20`、`pages=1`；`target_count` 记录 `count × pages`，`scroll_count` 记录首屏之后的续页数。X 返回条数可能高于 `count`。此命令只执行一次手动采集，不调用 Jev、不启动 Cron；`x:collect:probe` 仍保持只写本地调试文件、不写业务数据库。

## 结果与验证边界

结果写入 Git 忽略的 `debug-artifacts/x-probe/<uuid>.json`。文件包含帖子内容、作者、时间、媒体 URL、分页游标和 `entryId` / `sortIndex` 证据，不包含 Cookie；它仍属于账号可见数据，应留在本机私有目录，不提交或公开。

输出里的 `position` 和上游 `entryId` / `sortIndex` 只记录本次 HTTP 响应顺序，`orderVerified` 固定为 `false`。用户已决定不把与网页当前列表逐条一致作为继续推进的门槛。一次成功响应证明本次请求和解析可用，不证明排序与网页完全等价、稳定分页或长期有效；离线检查也不能替代真实账号探测。
