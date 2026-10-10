# X Intelligence

将授权 X For You 推荐流转换为结构化、可分类、可检索的信息收件箱。

项目基线见 [交接文档](docs/handoff.md)，开发约束见 [AGENTS.md](AGENTS.md)。当前实现范围为 Phase 1；尚未接入 X、Jev 或生产调度。

## 环境与运行

使用 Node.js 22.14+ 和 pnpm 11.24.0（版本固定于 packageManager），推荐 Node.js 24 LTS。

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm build
pnpm typecheck
```

Web：`http://localhost:3000`，提供 `/dashboard`、`/feed`、`/runs` 占位页面。
Collector：`http://localhost:3001/api/health`，返回 `{"status":"ok"}`，不包含 Web UI。

共享 package 通过 workspace 导出 TypeScript 源码，build 执行类型检查，Next.js 负责应用打包。无需额外打包库。

## 目录

```text
apps/
  web/                 # Next.js App Router、Tailwind v4、shadcn/ui
  collector/           # Next.js API-only
packages/
  db/src/              # Schema、Neon 连接工厂
  db/drizzle/          # 版本化 SQL migration 与元数据
  x/src/               # X DTO 导出，后续添加 parser/selector
  classifier/src/      # PostClassifier 接口
  shared/src/          # DTO、主题及任务状态
docs/                 # 交接及阶段验证记录
```

## 数据库 migration

将 `.env.example` 复制为根目录 `.env` 并设置 DATABASE_URL。模板中的其他凭证暂不需要配置。

```bash
pnpm db:generate
pnpm db:check
pnpm db:migrate
```

`db:generate` 生成可审查的 SQL，不访问数据库；`db:check` 检查 migration 元数据；`db:migrate` 实际修改 DATABASE_URL 指定的数据库。构建不会自动执行 migration。

模型包括 x_post、feed_run、feed_observation、post_classification。X Post ID 使用字符串；观察记录使用 `(run_id, post_id)` 联合主键，position 从 1 开始表示本次采集中首次观察的顺序；时间使用 timestamptz，应用侧按 UTC 处理。updated_at 必须由后续写入逻辑主动更新。

分类结果字段在 PENDING 状态允许为空，CLASSIFIED 状态要求主题、分数、分类器、实际版本和分类时间完整。标签使用 text[]，不限制为数据库 enum。

## 凭证与后续工作

真实密钥和 Playwright storageState 不提交 Git；使用服务端环境变量，不加 NEXT_PUBLIC_ 前缀。生产登录态加密与 Private Blob 在后续阶段实现。

Phase 2 已调整为保留人工登录、接入 twitter-monitor Web GraphQL 并先进行小规模验证；验证后推进幂等事务写入及采集状态记录，稳定后再接 Jev。并发任务领取、超时恢复及 SUCCESS/PARTIAL 判定需要在 job 实现时明确。

## X 终端登录

```bash
pnpm install --frozen-lockfile
pnpm x:auth
```

使用 twitter-monitor 固定版本的 Web HTTP 登录流程，不打开浏览器。按终端提示输入用户名、密码及必要的验证码；密码和验证码隐藏输入，不写入文件。Viewer 验证后确认账号，才保存 `playwright/.auth/x.json`。已有文件需要确认覆盖，失败或取消保留旧会话。

不再需要 `pnpm x:auth:install`。旧的浏览器会话文件仍可用于探针；新文件仅包含两项 cookie，不是完整浏览器状态。账号凭证和验证码不要发送到聊天中。

```bash
pnpm x:auth --help
pnpm x:auth:test
```

流程、限制及验证边界见 [登录工具](docs/manual-login.md)。

## Web GraphQL 采集探针

按本次确认保留 twitter-monitor 原始 HTTP/TLS 行为，先验证一页：

```bash
pnpm x:collect:probe --count 10 --pages 1
```

需已有本地登录态；结果写入被 Git 忽略的 `debug-artifacts/x-probe/`。不写数据库，推荐顺序尚待人工对照。依赖、最小兼容补丁及验证步骤见 [接入验证说明](docs/twitter-monitor-probe.md)。
