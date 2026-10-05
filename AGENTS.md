# 开发约束

回答避免过分夸赞。双方判断都可能有误，优先保证准确性；必要时索要补充信息或证据，保持输出条理清晰。

## 项目基线

开发前阅读 `docs/handoff.md`。它是当前阶段的产品与架构基线。已确定的技术选型不重新讨论；发现明确实现障碍时，先说明证据和最小调整方案。

当前仓库根目录就是本项目目录，不要在其中再创建一层 `x-intelligence/`。

## 当前范围

当前仅完成仓库准备；正式实现首先推进交接文档 Phase 1：可运行的 Monorepo Skeleton。

- 使用 pnpm、Turborepo、TypeScript strict。
- 保持 `apps/web`、`apps/collector` 和四个共享 package 的边界，不继续拆分 package。
- Web 使用 Next.js App Router、Tailwind CSS v4、shadcn/ui；优先 Server Components。
- Collector 使用轻量 Next.js API 应用，不负责 Web UI。
- 数据库使用 PostgreSQL、Neon、Drizzle；Schema 修改同步 migration。
- Phase 1 不实现真实 X 采集、Jev 接入、生产 Cron 或 Private Blob 配置。

## 实现约束

- 采集、分类、展示独立；帖子与推荐观察记录分别保存。
- X Post ID 使用原始字符串，不使用文字哈希或 JavaScript number 代替。
- X DOM selector 集中到 `packages/x/src/selectors.ts`，Parser 支持静态 HTML fixture 测试。
- Post 插入幂等，数据库时间统一 UTC，页面按用户时区展示。
- 分类记录保存实际 classifier 和版本；业务层通过分类接口隔离第三方 SDK。
- 不吞异常，不大量使用 any；新增依赖前说明用途。
- 不引入 stealth、指纹伪装、验证码或反 Bot 绕过逻辑。
- storageState 视为账号凭证，不提交 Git、不公开发布、不明文存数据库。
- Secret 不使用 NEXT_PUBLIC_；Cron 接口验证 CRON_SECRET。
- 不引入文档排除的消息队列、微服务、向量数据库或额外 AI 能力。

## 验证与交付

每阶段先验证可运行再扩展。Phase 1 完成后报告文件变更、目录、依赖、build/lint 结果、migration 状态、架构冲突和 Phase 2 建议。

区分静态检查、构建、数据库执行和真实外部服务验证；未执行的检查不得声称通过。未经明确要求不提交、推送或部署。
