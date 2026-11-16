# X Intelligence — Codex 开发交接文档

> 本文档用于将前期在 ChatGPT 中完成的产品讨论、技术选型和架构设计迁移到 Codex Thread。\
> 后续开发应以本文档作为当前阶段的项目基线。除非发现明确技术问题，否则不要重新讨论已经确定的技术选型。

---

# 1. 项目背景

我们准备开发一个个人/小型内部使用的 **X（Twitter）For You 信息流智能整理工具**。

核心目标不是重新实现 X，而是：

1. 自动采集授权账号的 X `For You` 首页帖子；
2. 保存每次推荐流中出现的帖子以及推荐顺序；
3. 使用 Jev 对帖子进行主题识别、标签分类和相关性判断；
4. 将杂乱的 X 推荐流整理成结构化的信息流；
5. 使用 Next.js Web 页面按照 Topic、Tag、时间等维度展示；
6. 后续进一步支持趋势分析、推荐重复率、主题分布等能力。

产品可以暂时理解为：

> **X Intelligence Inbox**

即：

```text
X For You
    ↓
采集
    ↓
结构化
    ↓
AI 分类
    ↓
按主题整理
    ↓
更高效地阅读 X
```

---

# 2. 已确认的重要前提

## 2.1 X 数据采集授权

项目已获得合作授权读取授权账号的 `For You` 推荐流；此前也确认 Web GraphQL 访问在该合作范围内。授权只覆盖已明确批准的账号、数据和访问方式，不代表允许任意自动化操作，也不代表可以规避平台的安全校验。

当前实施边界：

- 账号绑定通过服务端托管、用户可见的 Patchright 浏览器流程完成；用户直接在 X 页面中输入登录信息并处理页面验证，应用不收集密码或验证码。
- 遇到无法由用户正常完成的挑战、账号保护或访问拒绝时停止，不尝试验证码绕过、代理轮换、额外指纹伪装或其他反自动化规避。
- For You 采集仅使用已确认获批的访问路径；合作白名单不等于对其他接口或用途的授权。
- 部署前仍要确认白名单绑定对象和运行服务的出口 IP 是否匹配。

项目目标是：

```text
稳定
可维护
可观测
可审计
```

---

# 3. 尚未确认的外部条件

以下内容不是开发阻塞项，但部署前需要确认。

## X 白名单是否要求固定出口 IP

需要最终确认合作白名单绑定的是：

```text
X Account
或
Application
或
固定 IP
或
三者组合
```

如果要求固定 IP：

优先研究：

```text
Vercel Pro + Static IP
```

如果当前 Vercel 部署方式无法满足合作协议，再考虑将 Collector 单独迁移至固定出口 IP 的服务器。

因此：

> Collector 必须保持独立边界，不允许和 Web 页面严重耦合。

---

# 4. 已确定技术栈

## Monorepo

```text
pnpm
Turborepo
TypeScript
```

---

## Web

```text
Next.js App Router
React
TypeScript
Tailwind CSS v4
shadcn/ui（Base UI primitives，preset `b3REvH1Um`）
shadcnblocks
Animate UI（动效 Primitive 与 Effects）
```

### Web UI 组件约束

本项目页面默认使用有动效的组件。涉及动效时，组件选择顺序为：Animate UI 提供 Primitive 替换的组件 > Animate UI 已提供但没有 Primitive 替换的组件 > 原生 shadcn 组件与 shadcnblocks block（同级）> 经改造的组件 > 自建组件。

页面结构优先复用合适的 shadcnblocks block 或 shadcn 组件；同级时按页面需求选择。先保留并调整现有 block；仅在 block 无法满足需求或修改成本接近重写时，才改用 shadcnblocks/shadcn 组件组合页面；自建组件只用于现有组件都无法满足的情况。Animate UI 有 Base UI Primitive 替换时，优先通过其 CLI 替换共享的 `components/ui` Primitive；引用这些共享组件的 block 会继承动效。CLI 未覆盖的 Primitive 保持原实现。页面布局、普通 HTML、非 shadcn 或大幅改造的组件需要动效时，先使用 Animate UI Effects，再考虑 Motion。

Base UI 控件与 block 使用 Base UI API（如 `render`）；Animate UI 组件则按其自身 API（可包含 `asChild`）使用。实现须遵循 Animate UI skill 的动效与减少动态效果要求；首屏主要文本不能因入场动效在服务端 HTML 中隐藏。详细约束见仓库根目录 `AGENTS.md`。

Web 的职责：

```text
Dashboard
Feed
Topic 页面
Trend 页面
Collection Run 页面
Settings
```

---

## X Collector

```text
Patchright（仅用于用户可见的 X 账号绑定浏览器）
twitter-monitor 固定版本核心（For You HTTP 采集）
TypeScript
```

运行环境：

```text
长运行 Collector 服务或专用远程浏览器服务
```

Collector 保持轻量 Next.js App Router 项目边界，以便统一管理 API 路由和任务入口：

```text
Route Handler
Environment Variables
```

交互式浏览器会话需要跨请求持续存在，不能放入无状态的 Vercel Serverless Function。具体主机/远程浏览器供应商尚未确定。

但 Collector 不负责 Web UI。

---

## AI 分类

```text
Jev
```

当前阶段不使用 OpenAI Decisions API。

Jev 负责：

```text
Primary Topic
Semantic Tags
Relevance
可能的内容类型判断
```

Jev 不是内容采集器。

Jev 也不负责自然语言摘要。

---

## 数据库

```text
PostgreSQL
Neon
Drizzle ORM
```

---

## Authentication State Storage

工具账号由 Better Auth 管理；X 账号会话按 `x_account` 归属，以环境密钥做 AES-GCM 加密后保存到 PostgreSQL。产品目标是服务端托管的隔离远程浏览器；本机 CLI 仅作为现有开发与迁移工具。

不要将 storageState：

```text
提交 Git
打包进 Docker
明文放数据库
作为普通静态文件发布
```

storageState 应当被视为账号凭证。

---

# 5. 部署架构

使用：

```text
一个 Git Repository
+
一个 Web 项目
+
一个长运行 Collector/Browser 项目
```

---

## Project 1

```text
x-intelligence-web
```

Root Directory：

```text
apps/web
```

职责：

```text
Next.js Web
Dashboard
Feed
Topics
Trends
Runs
Settings
```

---

## Project 2

```text
x-intelligence-collector
```

Root Directory：

```text
apps/collector
```

职责：

```text
远程账号绑定浏览器
采集任务
Jev classification jobs
```

两个项目共享：

```text
packages/db
packages/x
packages/classifier
packages/shared
```

---

# 6. 推荐 Monorepo 目录

第一版按照以下结构初始化：

```text
x-intelligence/
│
├── apps/
│   │
│   ├── web/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── dashboard/
│   │   │   ├── feed/
│   │   │   ├── topics/
│   │   │   ├── trends/
│   │   │   ├── runs/
│   │   │   └── settings/
│   │   │
│   │   ├── components/
│   │   ├── lib/
│   │   └── package.json
│   │
│   └── collector/
│       │
│       ├── app/
│       │   └── api/
│       │       └── cron/
│       │           ├── collect/
│       │           │   └── route.ts
│       │           └── classify/
│       │               └── route.ts
│       │
│       ├── src/
│       │   ├── browser/
│       │   ├── jobs/
│       │   └── auth/
│       │
│       ├── vercel.json
│       └── package.json
│
├── packages/
│   │
│   ├── db/
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── x/
│   │   └── src/
│   │       ├── parser.ts
│   │       ├── selectors.ts
│   │       ├── types.ts
│   │       └── normalizer.ts
│   │
│   ├── classifier/
│   │   └── src/
│   │       ├── classifier.ts
│   │       ├── jev-classifier.ts
│   │       └── types.ts
│   │
│   └── shared/
│       └── src/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

不要为了“架构漂亮”继续拆更多 package。

---

# 7. 核心架构

整个数据链路：

```text
X For You
    ↓
Playwright
    ↓
X Post Parser
    ↓
Post Normalizer
    ↓
PostgreSQL
    ↓
PENDING Classification
    ↓
Jev
    ↓
CLASSIFIED
    ↓
Next.js Web
```

重要原则：

```text
采集 ≠ 分类
分类 ≠ 展示
帖子 ≠ 推荐观察记录
```

---

# 8. Playwright Collector 设计

## 登录

开发环境：

人工登录一次：

```text
pnpm x:auth
```

打开 Chromium：

```text
X Login
    ↓
2FA
    ↓
进入 /home
    ↓
保存 storageState
```

本地：

```text
playwright/.auth/x.json
```

必须：

```gitignore
/playwright/.auth/
```

---

## 页面

进入：

```text
https://x.com/home
```

采集：

```text
For You
```

建议合作账号统一设置：

```text
UI Language = English
```

因此可以使用：

```ts
page.getByRole("tab", {
  name: "For you",
});
```

---

# 9. Selector 管理原则

所有与 X DOM 有关的 selector 必须集中到：

```text
packages/x/src/selectors.ts
```

例如：

```ts
export const X_SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  tweetPhoto: '[data-testid="tweetPhoto"]',
} as const;
```

禁止 selector 散落在：

```text
route.ts
job.ts
service.ts
React component
```

因为 X Web DOM 并不是稳定 API。

X 改 DOM 后，应尽可能只修改：

```text
selectors.ts
parser.ts
```

---

# 10. 无限滚动采集原则

X 首页属于动态虚拟化列表。

已经滚出视口的 Post DOM 可能被删除。

因此禁止一次性：

```ts
locator(...).all()
```

然后长期持有 Element。

正确过程：

```text
读取当前 viewport
    ↓
立即解析
    ↓
Map<postId, Post>
    ↓
scroll
    ↓
等待新数据
    ↓
读取当前 viewport
    ↓
继续去重
```

停止条件至少包括：

```text
targetCount reached

或

maxScrolls reached

或

连续 N 次滚动没有发现新 Post
```

---

# 11. X Post ID

唯一键必须直接使用 X Post ID。

从：

```text
/{username}/status/{postId}
```

解析。

禁止使用：

```text
hash(text)
```

因为：

```text
相同文字
≠
同一个 Post
```

---

# 12. XPost Domain DTO

建议：

```ts
export interface XPost {
  id: string;

  url: string;

  text: string;

  lang: string | null;

  authorId?: string | null;

  username: string | null;

  authorName: string | null;

  publishedAt: string | null;

  images: {
    src: string;
    alt: string | null;
  }[];

  quotedPostId?: string | null;

  quotedText: string | null;
}
```

第一版无需追求完整复制 X 的全部数据结构。

只采集当前业务需要的数据。

---

# 13. For You 不能只保存 Post

这是重要架构决策。

例如：

第一次：

```text
A
B
C
D
```

第二次：

```text
C
E
A
F
```

如果只存：

```text
x_post
```

我们只能知道：

```text
A 出现过
```

无法知道：

```text
A 被推荐多少次
A 每次处于什么位置
```

因此必须区分：

```text
Post
```

和：

```text
Feed Observation
```

---

# 14. 数据库模型

第一版至少建立四组数据。

---

## x_post

保存帖子实体。

字段建议：

```text
id
author_id
username
author_name

text
lang

published_at
url

quoted_post_id
quoted_text

media_json

created_at
updated_at
```

其中：

```text
id = X Post ID
```

Primary Key。

---

## feed_run

表示一次完整 For You 采集。

字段：

```text
id

started_at
finished_at

status

target_count
collected_count

scroll_count

error_message
```

状态：

```text
RUNNING
SUCCESS
PARTIAL
FAILED
```

---

## feed_observation

表示：

> 某一条 Post 在某一次 For You Feed 中出现。

字段：

```text
run_id
post_id

position

observed_at
```

建议：

```text
PRIMARY KEY(run_id, post_id)
```

---

## post_classification

字段：

```text
post_id

topic

tags

relevance_score

classifier
classifier_version

status

retry_count

error_message

classified_at
created_at
updated_at
```

状态：

```text
PENDING
PROCESSING
CLASSIFIED
FAILED
```

---

# 15. FeedObservation DTO

Collector 最终最好不要只返回：

```ts
XPost[]
```

而是：

```ts
interface FeedObservation {
  post: XPost;

  position: number;

  observedAt: Date;
}
```

这样采集层不会丢失推荐排序信息。

---

# 16. Jev 设计

定义领域接口：

```ts
export interface PostClassifier {
  classify(
    post: XPost
  ): Promise<PostClassification>;
}
```

业务层不能直接依赖 Jev SDK。

实现：

```text
JevPostClassifier
```

以后如果更换为 OpenAI Decisions：

```text
OpenAIPostClassifier
```

不应该影响：

```text
Collector
DB
Web
```

---

# 17. 分类结构

第一版 Primary Topic 暂定：

```text
ai
programming
product
startup
finance
gaming
design
science
news
life
other
```

不要立即增加几十个一级分类。

---

## Semantic Tags

Tags 是多选。

例如：

```text
AI
├── OpenAI
├── Claude
├── Gemini
├── LLM
├── Agent
├── MCP
└── RAG
```

Programming：

```text
Java
Spring
React
Next.js
Vue
Database
DevOps
GitHub
Open Source
```

不要把所有 Tag 硬编码到数据库 enum。

---

## 示例

```json
{
  "topic": "programming",
  "tags": [
    "react",
    "nextjs",
    "frontend"
  ],
  "relevanceScore": 0.88
}
```

---

# 18. 必须记录模型版本

分类记录必须保存：

```text
classifier = "jev"

classifier_version = "具体实际版本"
```

禁止只保存：

```text
topic = ai
```

原因：

未来升级：

```text
Jev v1
→
Jev v2
→
OpenAI Decisions
```

需要能够判断历史分类由谁生成。

---

# 19. 采集和分类必须拆成两个 Job

禁止：

```text
Playwright
    ↓
抓一个 Post
    ↓
等待 Jev
    ↓
继续 scroll
```

这会让浏览器 Session 存活时间非常长。

正确设计：

```text
Collect Job

Playwright
    ↓
100 Posts
    ↓
DB transaction
    ↓
PENDING
    ↓
关闭 Browser
```

然后独立：

```text
Classification Job

SELECT PENDING
    ↓
Jev
    ↓
CLASSIFIED
```

因此：

```text
Jev 故障
≠
采集失败

Playwright 故障
≠
已采集数据丢失
```

---

# 20. Vercel Cron

Collector Project 计划两个 Cron。

例如：

```json
{
  "crons": [
    {
      "path": "/api/cron/collect",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/classify",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

具体时间间隔未来可以调整。

不要把间隔写死进业务逻辑。

---

# 21. Cron 安全

所有 Cron Route 必须验证调用来源。

至少支持：

```text
CRON_SECRET
```

例如：

```text
Authorization: Bearer ${CRON_SECRET}
```

不要提供一个任何互联网用户都可以触发：

```text
/api/cron/collect
```

的公开接口。

---

# 22. Collector 可观测性

每次 Feed Run 至少记录：

```text
started_at
finished_at

target_count
collected_count

scroll_count

status
error
```

未来 Web `/runs` 页面需要能够展示：

```text
Run #1021

Started        14:30
Status         SUCCESS

Target         150
Collected      143
New             71
Duplicate       72

Classified      68
Failed           3

Duration       31.2s
```

这不是可有可无的后台日志，而是产品的重要维护界面。

---

# 23. Playwright 异常处理

至少识别：

```text
AUTH_EXPIRED
PAGE_LOAD_FAILED
FOR_YOU_NOT_FOUND
NO_POST_FOUND
PARSER_FAILED
TIMEOUT
UNKNOWN
```

如果检测到：

```text
/i/flow/login
```

或者明确登录态失效：

不要无限重试。

应该：

```text
FeedRun FAILED
error = AUTH_EXPIRED
```

以后增加通知机制。

---

# 24. Playwright Debug Artifact

发生解析异常时，开发环境建议保存：

```text
screenshot
HTML
Playwright trace
```

但生产环境注意：

这些内容可能包含 X 用户数据。

因此：

```text
不要永久无条件保存
不要公开暴露
```

V1 可以只在明确 debug 模式启用。

---

# 25. Web V1 页面

第一版暂定以下页面。

---

## /dashboard

显示：

```text
Today

328 posts

AI             91
Programming    67
Product        43
Startup        31
Gaming         21
Other          75
```

以及：

```text
Latest Collection
Topic Distribution
Classification Status
```

---

## /feed

帖子信息流。

支持：

```text
Topic Filter
Tag Filter
Time Filter
Search
```

Post Card：

```text
Author
Time
Text
Media preview
Topic
Tags
Open original X Post
```

---

## /topics/[topic]

例如：

```text
/topics/ai
/topics/programming
/topics/product
```

---

## /trends

未来用于：

```text
主题趋势
Tag 趋势
重复推荐次数
Topic 占比变化
```

V1 可以先只做简单 Topic Count。

---

## /runs

显示采集和分类任务。

这是第一版必须存在的维护页面。

---

## /settings

以后管理：

```text
collection frequency
target count
topic configuration
Jev settings
X auth status
```

第一版允许只有基础 UI。

---

# 26. UI 技术约束

使用：

```text
shadcn/ui
shadcnblocks
Animate UI
Tailwind CSS v4
```

优先：

```text
Server Components
```

只有需要交互状态时才使用：

```text
"use client"
```

不要把整个 Dashboard 做成 Client Component。

---

# 27. 第一版暂时不要做的东西

为了控制项目复杂度，V1 不引入：

```text
Redis
Kafka
RabbitMQ
Vercel Queues
复杂微服务
Kubernetes
Elasticsearch
向量数据库
独立 Spring Boot Backend
```

Classification Queue 第一版直接使用 PostgreSQL 状态：

```text
PENDING
PROCESSING
CLASSIFIED
FAILED
```

即可。

如果未来数据量明显增长，再引入真正 Queue。

---

# 28. 第一版暂时不解决的 AI 能力

暂时不做：

```text
AI 长摘要
每日新闻总结
RAG
Semantic Search
Embedding
推荐系统
自动生成报告
```

当前 AI 功能集中在：

```text
主题分类
标签分类
相关性判断
```

---

# 29. 媒体处理

Jev 当前主要用于文本分类。

V1：

```text
post.text
+
quotedText
+
可利用的图片 alt
```

作为主要分类上下文。

对于：

```text
只有图片
图片承载主要信息
视频
```

第一版允许分类质量较低。

未来可以增加独立：

```text
Vision → Media Description
```

再交给 Jev。

不要为了媒体识别阻塞 V1。

---

# 30. 推荐算法污染问题

需要注意：

Playwright 打开和滚动 `For You` 本身可能产生 impression。

需要未来向 X 合作方确认：

> 白名单自动采集产生的曝光是否会参与该账号推荐算法训练或行为反馈。

如果会，需要考虑专用采集账号或合作侧提供的隔离机制。

暂时记录为风险，不阻塞开发。

---

# 31. 环境变量规划

不要直接照抄真实密钥。

至少预留：

```env
DATABASE_URL=

JEV_API_KEY=

CRON_SECRET=

X_AUTH_BLOB_URL=
X_AUTH_ENCRYPTION_KEY=

BLOB_READ_WRITE_TOKEN=
```

未来若使用固定 IP / 其他 X 合作配置，再增加对应变量。

任何 Secret：

```text
禁止 NEXT_PUBLIC_
```

---

# 32. Coding Principles

## TypeScript

尽可能启用 strict。

禁止大量：

```ts
any
```

---

## Domain Boundary

核心领域 Type 放：

```text
packages/shared
packages/x
packages/classifier
```

不要让：

```text
apps/web
apps/collector
```

各自复制 DTO。

---

## Error Handling

不要：

```ts
catch {
  return null;
}
```

吞异常。

应提供有业务意义的错误类型或 error code。

---

## Database

所有 Post Insert 必须幂等。

依赖：

```text
x_post.id
```

唯一键。

建议使用：

```text
INSERT ... ON CONFLICT
```

对应的 Drizzle upsert 能力。

---

## 时间

数据库时间统一：

```text
UTC
```

Web 页面根据用户时区显示。

---

# 33. Codex 开发原则

后续开发过程中请遵守：

1. 不要重新发起已经确定的技术选型讨论；
2. 如果发现当前方案存在明确实现障碍，应说明证据后调整；
3. 优先小步提交；
4. 每个阶段先确保可以运行，再继续增加能力；
5. 不要一次生成整个系统的大量不可验证代码；
6. 新增依赖前说明用途；
7. 不为了设计模式而设计模式；
8. 保持 Collector、Classifier、DB、Web 之间边界清晰；
9. 避免在业务层直接依赖第三方 SDK；
10. 修改数据库 Schema 时同步 migration；
11. 优先可测试的纯函数；
12. X DOM Parser 要能够使用静态 HTML fixture 测试；
13. 不引入任何 Playwright stealth / anti-bot 绕过逻辑。

---

# 34. 第一阶段开发目标

现在不要直接开发完整 Dashboard。

第一阶段目标：

> **建立可运行的 Monorepo Skeleton。**

请按以下顺序推进。

---

## Phase 1.1 — Monorepo 初始化

建立：

```text
apps/web
apps/collector

packages/db
packages/x
packages/classifier
packages/shared
```

使用：

```text
pnpm
Turborepo
TypeScript
```

确保：

```bash
pnpm install
pnpm build
pnpm lint
```

能够成功。

---

## Phase 1.2 — apps/web

初始化：

```text
Next.js App Router
Tailwind CSS v4
shadcn/ui
```

创建最基础：

```text
/dashboard
/feed
/runs
```

暂时可以是 Placeholder。

目的只是确认 Web 工程正常。

---

## Phase 1.3 — apps/collector

建立轻量 Next.js API-only 项目。

创建：

```text
/api/health
```

返回：

```json
{
  "status": "ok"
}
```

确认：

```text
collector build
```

正常。

---

## Phase 1.4 — Database

引入：

```text
Drizzle
PostgreSQL
```

建立：

```text
x_post
feed_run
feed_observation
post_classification
```

Schema。

生成初始 migration。

---

## Phase 1.5 — Shared Types

定义：

```text
XPost
FeedObservation
PostClassification
```

确保：

```text
web
collector
classifier
```

可以共享。

---

# 35. 第二阶段

Phase 2 才进入：

```text
Playwright 本地 X 登录
storageState
For You 页面
DOM Parser
无限滚动
数据库写入
```

第一版先在本地开发环境跑通：

```text
X
↓
Playwright
↓
100 posts
↓
PostgreSQL
```

在这个流程稳定之前：

不要接 Jev。

---

# 36. 第三阶段

接入：

```text
Jev
```

实现：

```text
PostClassifier
JevPostClassifier
```

完成：

```text
PENDING
↓
CLASSIFIED
```

---

# 37. 第四阶段

Web 真正读取数据库。

完成：

```text
Dashboard
Feed
Topics
Runs
```

---

# 38. 第五阶段

再完成：

```text
Vercel
Neon
Private Blob
Cron
encrypted storageState
```

不要在 Playwright 本地采集尚未稳定时提前处理完整生产部署。

---

# 39. 当前项目定义

项目临时名称：

```text
X Intelligence
```

名称未来可以更改。

核心定义：

> 将授权 X For You 推荐流转换为结构化、可分类、可检索的信息收件箱。

---

# 40. Codex 当前立即执行的任务

请先检查当前 Repository 状态。

如果仓库尚未初始化：

按照本文档 **Phase 1** 创建 Monorepo Skeleton。

如果仓库已经存在：

先检查现有目录、package.json、pnpm workspace 和已有代码，再制定最小修改方案。

当前只执行：

```text
Phase 1
```

即：

```text
Monorepo
Web Skeleton
Collector Skeleton
Shared Packages
Database Schema
```

暂时不要：

```text
实现 X Playwright Collector
接入真实 X
接入 Jev
配置生产 Cron
配置 Vercel Private Blob
```

完成 Phase 1 后，请汇报：

1. 创建/修改了哪些文件；
2. Monorepo 最终目录；
3. 使用了哪些依赖；
4. `pnpm build` 是否通过；
5. `pnpm lint` 是否通过；
6. 数据库 migration 状态；
7. 是否发现与本文架构冲突的问题；
8. 下一步 Phase 2 的建议。

---

# 41. 最重要的架构原则

后续如果不知道某项能力应该放在哪里，以此判断：

```text
X 页面怎么读取？
→ packages/x / apps/collector

帖子怎么存？
→ packages/db

帖子属于什么主题？
→ packages/classifier

任务什么时候执行？
→ apps/collector

页面如何展示？
→ apps/web

通用 DTO / Schema？
→ packages/shared
```

最终保持：

```text
X
↓
Collector
↓
Database
↓
Classifier
↓
Database
↓
Web
```

不要把它重新变成：

```text
Next.js Page
↓
Playwright
↓
Jev
↓
直接返回 UI
```

---

以上内容作为当前阶段项目基线。


# 42. Phase 2 采集方案修订（2026-10-07）

用户确认 Web GraphQL 访问同样获合作白名单授权，并接受内部接口变动的维护成本。

保留 Collector、Classifier、DB、Web 和共享 DTO 边界，采集实现改为接入 BANKA2017/twitter-monitor 的固定版本核心。Playwright 保留用于人工登录和生成本地 storageState。

按用户明确要求，评估阶段保留上游原始 HTTP/TLS 配置，包括其 TLS cipher 调整，验证后再评估精简。此项是本文原始指纹相关约束的特定例外，不引入额外规避代码。

先完成小规模本地验证；For You 推荐顺序、分页、字段和真实请求可用性列入待验证清单。初步探测不写数据库、不接 Jev，不能将离线检查标为真实接口验收。


## 终端登录方案修订（2026-10-10）

历史方案：用户曾要求将原有 Playwright 人工登录替换为 twitter-monitor Web HTTP 登录。此决定后来被 2026-11-10 的 Patchright 人工登录方案取代；本段仅保留决策历史，不作为当前凭据收集或登录方式的授权。

## 自研登录与会话复用准备（2026-10-14）

用户明确调整推进顺序：先建立现状与授权样本证据，从自研 Web HTTP 登录和跨进程会话复用开始，再逐步替换 twitter-monitor 采集核心。REA 是调查工具，固定上游实现暂作为对照；不把维护时间直接当作失效证明。现有 package、DTO、数据库与 Web 边界不变，未知挑战停止及禁止新增规避逻辑继续适用。

阶段步骤、现状入口与真实退出条件见 [自研登录与会话复用准备](auth-session-preparation.md)。本次仅准备，不代表自研实现或真实登录验收完成。

## 人工登录调查授权补充（2026-10-18）

历史调查授权：用户曾允许正常浏览器参与协议验证，并同意在本地人工输入账号、密码、验证码以观察同次登录流程。该授权仅限当时的协议调查，不构成当前生产登录实现的授权；生产登录方案已由 2026-11-10 的 Patchright 修订取代。调查材料见 browser-bootstrap-observation.md。

## 浏览器专用持久化对照授权（2026-10-18）

历史调查授权：用户曾同意为 Playwright 使用仓库外专用持久化目录进行本地对照。该授权仅覆盖当时的调查，不是当前产品的登录或会话存储方案；当前方案见 2026-11-10 的 Patchright 修订。详细调查记录见 browser-bootstrap-observation.md。

## 自研登录编排与仓库清理（2026-11-02）

按用户当前要求，移除 twitter-monitor vendor、登录和采集适配、For You 探针及其专属依赖。登录入口切换为自研 JP-5 编排，独立 SDK 调查材料保留。此修订取代此前固定上游接入决定；未知状态停止、凭证私有保存和禁止新增规避逻辑的约束继续适用。

生产运行时、POST 和认证会话适配尚未完成，`pnpm x:auth` 在读取凭证前明确停止。完整登录和跨进程复用仍待真实验证。当前用法见 manual-login.md；早期上游与探针文档仅作历史记录。

## Patchright 人工登录与数据库会话存储修订（2026-11-10）

本修订取代 JP-5 CLI 登录运行时。`pnpm x:auth` 通过 Patchright 的 `channel: "chrome"` 启动本机已安装的 Google Chrome Stable，并使用隔离的临时浏览器上下文；用户在窗口中手动完成 X 登录。程序验证首页及 `auth_token`、`ct0`，将 `storageState({ indexedDB: true })` 以 AES-256-GCM 加密后保存到新增的 `x_auth_session` 表。密钥来自 `X_AUTH_ENCRYPTION_KEY`，不进入数据库。操作者确认账号名作为会话标签，代码尚不声称完成远端身份 API 校验。

会话状态包含实际存在的 Cookie、localStorage 和 IndexedDB。程序不保存 HAR、登录正文、请求头、密码或验证码；请求级 Castle、Prelude、transaction 字段不从历史采集回放，由当前浏览器流程产生。现有 JP-5 源码和离线演示入口已删除，研究文档保留为历史证据。新增 migration 已成功应用到当前 `DATABASE_URL` 指向的 PostgreSQL；用户随后回报本机登录命令已完成并保存会话，账号身份确认与跨进程复用仍待单独验收。Patchright 仅是本次登录入口的授权例外，不扩展为额外反 Bot 绕过。

## 数据库会话复用检查（2026-11-11）

用户回报本机 `pnpm x:auth` 已完成可见人工登录，并输出加密会话保存成功。该结果说明命令报告数据库写入成功，但不单独证明账号远端身份，也没有验证新进程能否解密并重新使用会话。

新增 `pnpm x:auth:verify`：从 PostgreSQL 读取并解密会话，注入新的隔离 Chrome 上下文并打开 X 首页，由用户目视核对账号；不写数据库、不落明文文件。此命令的真实 Windows/Chrome/数据库执行结果待用户回报。

按 Phase 2 已授权方案，恢复固定上游 commit `dd8de94e3e2853beb7b5e5b785f1908c2cafea4b` 的 twitter-monitor For You 核心，并新增 `pnpm x:collect:probe`。它从同一数据库解密会话，在内存提取 `auth_token`、`ct0`，默认请求 5 条、1 页；结果只写入 Git 忽略的本机调试目录，不写业务数据库、不调用 Jev。会话复用已由用户在 Windows 上通过浏览器目视核对；首次 HTTP 探测能解析真实帖子，但与网页列表未发现交集，推荐顺序尚未验收；`orderVerified` 保持 `false`。

## 当前网页 HomeTimeline 请求对齐（2026-11-11）

用户提供了当前 X 网页首屏 HomeTimeline 请求。它使用 `x.com/i/api/graphql`、queryId `KmJCeZ__ef1fNos7tKN_fg`、count 20、requestContext `launch`、`withCommunity=true`、`includePromotedContent=true`、3 个动态 `seenTweetIds`、`fieldToggles.withPayments=false` 和 42 个 feature flags。它与固定上游的 host/path、queryId、feature map 及部分变量不一致。探测适配器已按该首屏样本更新 path/queryId/features/field toggle，并省略过时的 `latestControlAvailable`。

不复制请求中的 Cookie、Authorization、CSRF 或动态 transaction ID；动态 `seenTweetIds` 也不硬编码，探测仍发送空列表。会话 Cookie 提取现在限定为通过验证的 `x.com`/`.x.com` 域。用户随后提供的 count=20 首屏探测结果含 35 条唯一且字段完整的帖子；浏览器响应也含 35 个帖子结果节点。两份数据不据此宣称 ID 或顺序一致。用户决定不再以逐条匹配为门槛；`orderVerified` 仍保持 `false`。此前提供的原始 curl 含认证材料，建议在 X 中终止该会话并重新运行 `pnpm x:auth` 后再测试。

## 手动持久化采集命令（2026-11-12）

新增 `pnpm x:collect:run`，与只写本地调试文件的 `x:collect:probe` 分离。该命令先创建 `RUNNING` 的 `feed_run`，调用相同 For You source，然后在一个事务中幂等 upsert `x_post`、记录 `feed_observation` 顺序、为尚无记录的帖子创建 `PENDING` 分类状态，并完成 `feed_run`。采集失败时尝试用安全错误码将 run 标记为 `FAILED`；不把 Cookie、请求正文、帖子正文或原始异常写入错误信息。

无需新增 schema 或 migration。命令默认请求 `count=20`、`pages=1`；`target_count=count×pages`，`scroll_count` 为首屏后的续页数。

用户于 2026-11-12 回报运行 `ee4e34b0-4935-44df-b29f-5b48c1ad944a` 成功；当前工作区按该 ID 从 `.env` 指向的 PostgreSQL 只读核验到 `SUCCESS`、35 条 `feed_observation`、35 条对应 `x_post`，分类状态均为 `PENDING`。重复采集幂等性仍待验证。

## TypeSafe Jev 分类任务（2026-11-12）

新增 `pnpm x:classify` 手动命令和 `JevPostClassifier`。它从数据库原子认领 `PENDING` 记录，按批次串行调用 TypeSafe `POST https://api.typesafe.ai/v1/systemone`，再将主题、有限标签和 0–1 相关性分数写回 `post_classification`。分类结果的 `classifier` 为 `jev`，`classifier_version` 取服务实际返回的版本；模型默认固定为 `jev-1.14.0`。

默认每批最多 5 条、上限 20 条；失败时只保存安全错误码为 `FAILED`，不自动重试；显式 `--retry-failed` 才重试。超过 1 小时未完成的 `PROCESSING` 记录会在下次命令启动时转为 `FAILED`。发送给 Jev 的状态仅包含帖子文本、引用帖文本和语言；不发送帖子 ID、作者、账号名或 URL。无新增依赖和 migration。

用户于 2026-11-13 回报在 Windows 环境执行 `pnpm x:classify --count 5` 成功；其 SQL 显示 5 条 `CLASSIFIED`（`jev-1.14.0`）、30 条 `PENDING`，无失败。这验证了少量真实 Jev 请求、响应映射和数据库写回。用户提供的 5 条文本中主题整体合理；`agent` 标签是否过宽、广告类内容的相关性评分仍待更多样本评估。最后一条正文含 `&amp;`，需确认 X 返回文本是否需在采集解析时解码。

## Jev 分类尝试快照（2026-11-13）

新增 `post_classification_attempt` 追加式记录，每次请求前保存非敏感请求快照，收到 JSON 响应后保存原始响应对象，并记录 provider、请求/响应模型、attempt number、状态和安全错误码。认证头和 API Key 不落库；快照包含帖子正文，故有数据保留要求。失败重试新增行，`post_classification` 继续作为当前业务结果。

新增 migration `0002_happy_nighthawk.sql` 已生成。此段记录形成时，migration 尚未应用；此前已完成的 5 条分类不会补出快照。后续运行结果见下方“分类抽查与 Web 信息流首个读路径”。详见 [分类流程说明](classification.md)。

## 分类抽查与 Web 信息流首个读路径（2026-11-13）

用户提供的审计导出包含 21 行，其中 1 行是此前已讨论的帖子；排除该行后，本次新分类为 20 条，状态均为 `SUCCEEDED`。人工初审认为主题整体可用，内容相关性分数偏低主要与样本中的抽奖、短句、推广帖等内容相符；这只通过原型阶段的初步门槛，不代表统计意义上的准确率。至少有两条短文本上的标签缺少正文证据，后续需扩大抽样并加强标签证据约束。

`0002_happy_nighthawk.sql` 已被后续审计查询结果证明应用到用户所查数据库。`CLASSIFICATION_TAGS` 现位于 shared DTO，Jev 与 Web 共用标签集合。

Twitter Monitor Parser 在生成 `XPost` 前对正文和引用正文解码常见命名实体及十进制/十六进制数字实体；新采集入库的正文会使用解码结果。既有 `post_classification_attempt` 请求快照保持原值；再次采集同一帖子会更新 `x_post`，但不会自动重新运行分类。

Phase 4 首个只读切片已开始：Web `/feed` 服务端查询 `x_post` 与 `post_classification`，支持关键词、主题、标签和时间过滤，并显示分类状态、相关性及帖子原文链接；本地 development 模式读取仓库根 `.env`，生产环境使用部署平台注入的变量。无新 migration，也不触发采集或 Jev。`pnpm typecheck`、`pnpm lint` 和生产构建通过；本机开发服务器通过根 `.env` 读取数据库并返回 HTTP 200，页面生成 35 张帖子卡片。尚未做浏览器截图检查；上线前仍需完成 Web 账号鉴权。

## Dashboard 与 Runs 数据读路径（2026-11-15）

Phase 4 增加 `/dashboard` 与 `/runs` 的只读数据库查询。Dashboard 展示今日 UTC 时间范围内去重观察到的帖子数、已保存帖子总数、采集运行总数、今日已分类帖子主题分布、今日分类状态和最近 5 次采集运行；`/runs` 按开始时间倒序展示最近 50 次运行的状态、目标/实际采集数、滚动次数、耗时及安全错误码。两页缺少 `DATABASE_URL` 或查询失败时展示明确提示，并增加路由级 Skeleton 加载状态。无 schema/migration 或新依赖；不触发采集、分类或 Jev。

当前通过 DB/Web TypeScript 检查、Web lint、Web 生产构建及 `git diff --check`。本次没有执行数据库查询或浏览器视觉检查，因此统计 SQL 的真实数据库运行结果及页面浏览器表现仍待本地联调确认。

## Phase 5-A 工具账号与数据归属（2026-11-15）

用户已确认产品采用服务端托管的远程浏览器完成 X 账号绑定，不要求最终用户安装本地助手。登录凭据由用户直接在可见的 X 浏览器页面中输入；Web 自建表单不接收 X 密码或验证码。远程浏览器服务供应商/部署主机尚未确定，且长连接浏览器会话不适合 Vercel Serverless Function。

本切片引入 Better Auth 邮箱/密码工具账号认证和受保护的 workspace 路由，并新增 `app_user`、`app_session`、`app_account`、`app_verification`、`x_account` 表。X 账号会话字段位于 `x_account`，只允许保存 AES-GCM 密文包。`feed_run` 增加 `x_account_id`；Dashboard、Runs、Feed 的读查询按当前用户拥有的 X 账号过滤。帖子正文仍按 X Post ID 全局去重，但未观察到该帖的其他用户不会从 Feed 查询中看到它。

历史数据被迁移到未认领的 `x-primary` 账号，运行记录继续关联该账号。未认领数据不会展示给新注册用户；后续绑定相同 X 账号时可设计明确的认领规则。新用户注册后会看到空工作区与绑定入口。

注册目前不要求邮箱验证，项目尚未配置邮件发送/密码重置流程；上线前需接入邮件服务并决定验证与找回策略。需要配置服务端 `BETTER_AUTH_SECRET`（至少 32 字符）和 `BETTER_AUTH_URL`。migration `0003_adorable_the_watchers.sql` 已生成但未应用到数据库。此次通过 `pnpm typecheck`；数据库 migration、真实注册/登录、浏览器验收及外部浏览器服务均未验证/实现。
