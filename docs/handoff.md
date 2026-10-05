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

当前项目具有 X 合作白名单。

我们假定该白名单：

- 明确允许使用 Playwright 自动化访问授权账号；
- 允许读取 X 首页 `For You` 推荐流；
- 不需要进行反自动化绕过。

因此：

### 可以使用

```text
Playwright
Chromium
storageState
DOM parsing
infinite scrolling
```

### 禁止主动实现

```text
stealth plugin
fingerprint spoofing
navigator.webdriver patch
验证码绕过
反 Bot 绕过
未经授权的内部接口破解
```

项目目标是：

```text
稳定
可维护
可观测
可审计
```

而不是与 X 的反自动化机制进行对抗。

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
shadcn/ui
shadcnblocks
```

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
Playwright
Chromium
TypeScript
```

运行环境：

```text
Vercel Function
```

Collector 建议仍使用一个非常轻量的 Next.js App Router 项目，以便：

```text
Vercel Deployment
Cron
Route Handler
Environment Variables
```

统一管理。

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

X 登录态：

```text
Playwright storageState
```

生产环境：

```text
storageState
    ↓
AES-GCM encryption
    ↓
Vercel Private Blob
```

Function 执行时：

```text
Private Blob
    ↓
download
    ↓
decrypt
    ↓
/tmp/x-auth.json
    ↓
browser.newContext({
    storageState
})
```

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
两个 Vercel Projects
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
Playwright
Chromium
Vercel Cron
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
