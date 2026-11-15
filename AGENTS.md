# 开发约束

回答避免过分夸赞。双方判断都可能有误，优先保证准确性；必要时索要补充信息或证据，保持输出条理清晰。

## 项目基线

开发前阅读 `docs/handoff.md`。它是当前阶段的产品与架构基线。已确定的技术选型不重新讨论；发现明确实现障碍时，先说明证据和最小调整方案。

当前仓库根目录就是本项目目录，不要在其中再创建一层 `x-intelligence/`。

## 当前范围

当前阶段：实现工具账号认证、按已绑定 X 账号隔离数据，并继续接入用户明确授权的服务端远程浏览器绑定流程。远程浏览器必须由用户在页面中可见操作；不得将登录密码、验证码或未加密会话状态写入日志或数据库。

- 使用 pnpm、Turborepo、TypeScript strict。
- 保持 `apps/web`、`apps/collector` 和四个共享 package 的边界，不继续拆分 package。
- Web 使用 Next.js App Router、Tailwind CSS v4、shadcn/ui；使用 Base UI primitives 与 preset `b3REvH1Um`，并按下列约束使用 Animate UI；优先 Server Components。
- Collector 使用轻量 Next.js API 应用，不负责 Web UI。交互式远程浏览器需要持续连接，因此必须运行在长运行服务或专用远程浏览器服务中，不能把有状态的浏览器交互放入 Vercel Serverless Function；实际部署平台尚未确定。
- 数据库使用 PostgreSQL、Neon、Drizzle；Schema 修改同步 migration。
- 下一步完成服务端远程浏览器绑定和按 X 账号运行采集；选定长运行部署目标前不启用生产调度。

## 实现约束

- 采集、分类、展示独立；帖子与推荐观察记录分别保存。
- X Post ID 使用原始字符串，不使用文字哈希或 JavaScript number 代替。
- X DOM selector 集中到 `packages/x/src/selectors.ts`，Parser 支持静态 HTML fixture 测试。
- Post 插入幂等，数据库时间统一 UTC，页面按用户时区展示。
- 分类记录保存实际 classifier 和版本；业务层通过分类接口隔离第三方 SDK。
- 不吞异常，不大量使用 any；新增依赖前说明用途。
- Patchright 仅用于用户可见、隔离的 X 账号绑定浏览器会话；用户不安装本地助手。该授权不扩展为代理轮换、验证码绕过、额外指纹伪装或采集链路的反 Bot 绕过。
- 工具账号认证使用 Better Auth；所有展示查询必须验证当前用户，并通过其 `x_account` ID 过滤运行和信息流。`x_post` 可以按 X Post ID 全局去重，但不得因此向用户展示其账号未观察到的帖子。
- storageState 视为账号凭证，不提交 Git、不公开发布、不明文存数据库；写入 PostgreSQL 前必须用环境密钥做应用层 AES-GCM 加密。
- Secret 不使用 NEXT_PUBLIC_；Cron 接口验证 CRON_SECRET。
- 不引入文档排除的消息队列、微服务、向量数据库或额外 AI 能力。

## Web UI 组件与动效约束

- 本项目页面默认使用有动效的组件。动效组件的选择顺序为：Animate UI 提供 Primitive 替换的组件 > Animate UI 已提供但没有 Primitive 替换的组件 > 原生 shadcn 组件与 shadcnblocks block（同级）> 经改造的组件 > 自建组件。
- 选择页面结构时，优先找合适的 shadcnblocks block 或 shadcn 组件；同级情况下按页面需求决定。先保留并调整 block 结构；只有 block 无法满足需求或修改成本接近重写时，才用 shadcnblocks/shadcn 组件重新组合；自建组件仅在现有两类组件都无法满足需求时使用。
- Animate UI 有对应 Base UI Primitive 时，优先通过 `@animate-ui/cli` 替换 `components/ui` 中的 Primitive。使用这些共享组件的 shadcnblocks block 会继承替换；若 block 自带 Primitive 源码，则检查并按 Animate UI 支持范围适配。CLI 未覆盖的 Primitive 保持原实现，不手工模拟 CLI 替换。
- 页面布局、普通 HTML、非 shadcn 或已大幅改造的组件需要动效时，先检查 Animate UI Effects；无法满足后再直接使用 Motion。遵循 Animate UI skill 的组件、token、退出动画和减少动态效果要求；首屏主要文本不能因入场动效在服务端 HTML 中隐藏。
- 通过 `@shadcnblocks` registry 安装 block 并审阅源码。Base UI 控件使用 `render` 等 Base UI API，不把 Radix 的 `asChild` 用在 Base UI 上；Animate UI 组件可以按其自身 API 使用 `asChild`。新增依赖前说明用途。

## 验证与交付

每阶段先验证可运行再扩展。Phase 1 完成后报告文件变更、目录、依赖、build/lint 结果、migration 状态、架构冲突和 Phase 2 建议。

区分静态检查、构建、数据库执行和真实外部服务验证；未执行的检查不得声称通过。未经明确要求不提交、推送或部署。

## Phase 2 授权与采集方案补充

用户已确认 Web GraphQL 访问也被合作白名单允许。保留现有四个共享 package、DTO、数据库和 Web 边界，采集通过 twitter-monitor 的固定版本核心实现；Playwright 保留为人工登录工具。

本次评估按用户明确要求保留上游原始 HTTP/TLS 行为，包括其 TLS cipher 调整。这是上述“不引入指纹伪装”约束针对本次上游接入的明确例外；不扩展为新增 stealth、验证码绕过或其他规避代码的授权。验证通过后再评估精简。

首先做本地少量 For You 探测，不写数据库、不调用 Jev；推荐顺序与当前接口有效性须以真实授权账号验证，不能用离线测试代替。


## 终端登录方案修订（2026-10-10）

用户明确要求将原有 Playwright 人工登录替换为 twitter-monitor Web HTTP 登录。CLI 交互输入用户名、隐藏密码和验证码，按上游任务推进；验证 Viewer 与账号确认后保存私有 cookie 会话。保留原始 HTTP/TLS 配置，不新增规避代码；未知挑战停止。原“Playwright 保留人工登录”的决定由此修订。真实登录与采集可用性仍需授权账号验证。

## Patchright 人工登录与数据库加密存储修订（2026-11-10）

用户明确要求推翻 JP-5 HTTP 编排，改用 Patchright 启动本机已安装的 Google Chrome，由用户手动完成登录。会话从隔离的临时浏览器上下文获取，校验 x.com 首页以及 auth_token/ct0 后，以 AES-256-GCM 加密完整 storageState，再写入 `x_auth_session`；加密密钥仅来自本地/部署环境变量 `X_AUTH_ENCRYPTION_KEY`。登录密码和验证码不经 CLI 收集，不保存 HAR、请求正文或请求头快照。Patchright 的自动化检测补丁仅用于此人工登录入口，其他反 Bot 绕过仍禁止。当前配置的 `DATABASE_URL` 已成功应用新增 migration；真实 X 登录与会话复用仍待授权账号验证。

## 服务端远程浏览器与多用户账号方向修订（2026-11-15）

用户已明确选择由服务端托管隔离浏览器完成 X 账号绑定，不要求最终用户安装 Node.js、Patchright 或本地助手。用户在 Web 页面中直接操作远程浏览器；应用不得把密码或验证码写入日志/数据库，成功后仅持久化按 `x_account` 隔离、AES-GCM 加密的浏览器会话。此决定取代“绑定必须由访问者电脑启动本机 Chrome”的范围，但不允许把凭据放入自建表单或扩展为自动绕过挑战。

当前部署文档中的 Vercel Serverless Collector 与交互式远程浏览器存在运行时冲突。浏览器绑定需要持续连接，因此 Collector 应部署在长运行服务或专用远程浏览器服务中；具体供应商尚未选择，也尚未实现。

Phase 5-A 已开始：工具账号由 Better Auth 提供邮箱/密码认证；新增 `app_user`/session 等表及 `x_account` 归属模型；Dashboard、Feed、Runs 查询按当前用户拥有的 X 账号过滤。未认领的旧 `x-primary` 数据仍保留但不会暴露给新用户。远程浏览器绑定界面与采集任务按账号运行尚未实现。
