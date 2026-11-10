# X Intelligence

将授权 X For You 推荐流转换为结构化、可分类、可检索的信息收件箱。

项目基线见 [交接文档](docs/handoff.md)，开发约束见 [AGENTS.md](AGENTS.md)。当前包含产品骨架和 Patchright 可见浏览器人工登录入口；真实账号登录、采集入库、Jev 和生产调度尚未验收。

## 环境与运行

使用 Node.js 22.14+ 和 pnpm 12.9.1（版本固定于 packageManager），推荐 Node.js 24 LTS。

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
  x/src/               # X DTO、selector 与 parser 工具
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

模型包括 x_post、feed_run、feed_observation、post_classification 和加密会话表 x_auth_session。X Post ID 使用字符串；观察记录使用 `(run_id, post_id)` 联合主键，position 从 1 开始表示本次采集中首次观察的顺序；时间使用 timestamptz，应用侧按 UTC 处理。updated_at 必须由后续写入逻辑主动更新。

分类结果字段在 PENDING 状态允许为空，CLASSIFIED 状态要求主题、分数、分类器、实际版本和分类时间完整。标签使用 text[]，不限制为数据库 enum。

## 凭证与后续工作

真实密钥和浏览器登录态不提交 Git；使用服务端环境变量，不加 NEXT_PUBLIC_ 前缀。当前 X storageState 在写入 PostgreSQL 前用 `X_AUTH_ENCRYPTION_KEY` 进行 AES-256-GCM 加密。

旧 twitter-monitor 登录/采集适配、For You 探针及自研 JP-5 登录运行时均已移除。现行登录入口是本地 Patchright 人工登录；本次 Patchright 用法限于该授权入口，不扩展为其他反 Bot 绕过。四个共享包、数据库和 Web 边界保持不变。

## X 人工登录

```bash
pnpm --filter @x-intelligence/collector exec patchright install chromium
pnpm x:auth
```

命令打开可见 Chromium，用户在窗口中手动完成登录。成功到达 X 首页并确认当前账号后，程序将完整 storageState 加密写入 `x_auth_session`；密码、验证码、HAR、请求正文和请求头不会被记录。旧会话只有在新登录成功并确认后才会覆盖。

运行前需设置 `DATABASE_URL` 和 32 字节 Base64 编码的 `X_AUTH_ENCRYPTION_KEY`。`x_auth_session` migration 已成功应用到当前 `DATABASE_URL` 指向的数据库；其他数据库环境需先审阅并应用 migration。步骤见 [登录工具](docs/manual-login.md)。当前没有运行真实 X 登录。
