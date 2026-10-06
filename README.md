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

Phase 2 首先实现本地人工登录、静态 HTML fixture parser 测试、视口逐批解析与去重、幂等事务写入及采集状态记录；稳定后再接 Jev。并发任务领取、超时恢复及 SUCCESS/PARTIAL 判定需要在 job 实现时明确。

## 人工 X 登录

在有图形桌面的电脑上，使用交互终端在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm x:auth:install
pnpm x:auth
```

工具打开新的 Chromium 会话。由你输入账号、密码并完成 2FA；将 X 界面设置为英文，确认账号正确并进入 `https://x.com/home`，保持浏览器打开，再回终端按回车。

工具检查首页、账号菜单、For you 标签页和有效登录 cookie 后，保存到 `playwright/.auth/x.json`。若已有文件，启动时须输入 `yes` 确认成功后覆盖；取消或验证失败保留原文件。整个操作最长 15 分钟，Ctrl+C 或关闭浏览器取消。

该文件包含账号凭证，已被 Git 忽略。在 Linux/macOS 上目录权限为 700、文件权限为 600；Windows 请使用当前用户的受保护目录。此工具仅供本地人工登录，不采集帖子、不访问数据库、不接入 Jev，也不用于生产登录态存储。

远程无桌面环境无法显示人工登录窗口，请在本地有桌面的电脑运行。Linux 如缺系统库，可按 Playwright 官方说明执行 `pnpm --filter @x-intelligence/collector exec playwright install --with-deps chromium`。

```bash
pnpm x:auth --help
pnpm x:auth:test
```

验证记录见 [人工登录工具](docs/manual-login.md)。
