# X Intelligence

将授权 X For You 推荐流转换为结构化、可分类、可检索的信息收件箱。

项目基线见 [交接文档](docs/handoff.md)，开发约束见 [AGENTS.md](AGENTS.md)。当前包含产品骨架与自研 JP-5 登录基础模块；真实登录、采集入库、Jev 和生产调度尚未验收。

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
  x/src/               # X DTO、自研 JP-5 解码、表单与登录编排
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

当前转向自研 JP-5 登录编排；旧 twitter-monitor 实现、For You 采集探针和专属依赖已移除。四个共享包、数据库模型和 Web 边界保持不变。SDK 源码和独立调查工具保留，不接入生产登录。

## 自研登录

```bash
pnpm x:auth --help
pnpm x:auth:test
pnpm x:auth:offline
```

`pnpm x:auth` 已切换为自研入口。当前生产适配器尚未实现，会以 `AUTH_RUNTIME_UNAVAILABLE` 非零退出，在读取账号凭证、发起网络请求、覆盖会话之前停止。

自研编排按服务端状态构建表单、处理隐藏密码与验证码输入、阻止循环/未知状态，完成候选必须经过独立身份验证及用户确认，之后才允许保存会话。真实运行还缺少同会话 Castle/transaction/Prelude 提供者、POST 传输和认证会话适配；离线测试不代表这些能力已实现。

`x:auth:offline` 仅运行合成状态演示，不访问网络或执行 SDK。原有私有会话文件保留，不读取、不迁移、不删除。详见 [登录工具](docs/manual-login.md)。
