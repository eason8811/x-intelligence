# Phase 1 验证记录

验证日期：2026-10-06（Asia/Shanghai）。范围：本地 Monorepo Skeleton；不是生产验收。

## 交付

- pnpm workspace、Turborepo、strict TypeScript、统一 ESLint。
- Web：Next.js App Router、Tailwind CSS v4、shadcn 基础配置、三个 Server Component 占位页面。
- Collector：独立 Next.js API-only 应用及 GET /api/health。
- 四个共享 package；XPost、FeedObservation、PostClassification 和 PostClassifier 接口。
- 四张 PostgreSQL 表、索引、外键、分类约束及 Drizzle 初始 migration。
- 凭证忽略规则、环境变量模板与使用说明。

## 已执行的验证

| 检查 | 结果 |
| --- | --- |
| pnpm install --frozen-lockfile | 通过 |
| pnpm peers check | 无 peer dependency 冲突 |
| pnpm lint | 六个 workspace 通过，零 lint 警告 |
| pnpm build | 两个 Next.js 应用构建及四个 package 类型检查通过 |
| pnpm typecheck | 六个 workspace 通过 |
| pnpm db:generate | 已生成初始 SQL 和 migration 元数据 |
| pnpm db:check | 通过 |
| pnpm db:migrate | 独立临时 PostgreSQL 17 上执行成功；第二次执行仍只有一条 migration 记录 |
| 数据库约束测试 | packages/db/tests/schema.sql 执行成功，事务回滚 |
| Web HTTP | /dashboard、/feed、/runs 返回 200，正文包含 X Intelligence |
| Collector HTTP | /api/health 返回 200，JSON 为 {"status":"ok"} |

数据库测试覆盖字符串大整数 ID、幂等插入、PENDING 默认值、观察记录去重、外键、正数位置、分数范围、CLASSIFIED 必填字段及有效分类更新。

## 依赖与限制

版本已固定，详见各 package.json 和 pnpm-lock.yaml。

主要版本：Next.js 16.3.8、React 19.3.0、Tailwind CSS 4.3.3、Turborepo 2.11.7、TypeScript 6.0.3、Drizzle ORM 0.45.3、Drizzle Kit 0.31.11、Neon serverless 1.2.0。

ESLint 保留 9.39.5：当前 Next.js 配置的部分传递插件 peer 范围尚不支持 ESLint 10；安装会提示 ESLint 9 已停止维护。Drizzle Kit 也含弃用的 esbuild-kit 传递依赖。未忽略 peer 冲突或 lint 警告，后续随上游兼容版本升级。

pnpm 仅允许 esbuild 和 unrs-resolver 执行依赖构建脚本。占位页面使用系统字体，构建无需下载 Google 字体。shadcnblocks 暂无页面需求，未添加 block。

没有配置 DATABASE_URL，没有应用到 Neon。Neon 连接工厂已通过类型检查，但未进行真实 Neon 连接和事务验证。未接入 X、Jev、Cron、Private Blob、固定出口 IP 或生产部署。

未发现需要改变交接技术栈的实现障碍；Vercel Chromium 和 Jev 接口仍待后续阶段验证。

## Phase 2

先本地人工登录保存 storageState，再实现静态 HTML fixture parser 测试、虚拟列表逐批采集、排序去重及幂等事务写入。进入任务实现前明确采集状态、并发互斥、超时恢复和错误码；本地采集稳定后再接 Jev。
