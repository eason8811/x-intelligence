import Image from "next/image";
import Link from "next/link";
import { Effect } from "@animate-ui/react/primitives/effects/effect";
import {
  CLASSIFICATION_TAGS,
  TOPICS,
  type ClassificationTag,
  type Topic,
} from "@x-intelligence/shared";
import { listFeedPosts } from "@x-intelligence/db";
import { FilterPanel, FilterPanelSection } from "@/components/shadcnblocks/filter-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWebDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

const TOPIC_LABELS: Record<Topic, string> = {
  ai: "人工智能",
  programming: "编程",
  product: "产品",
  startup: "创业",
  finance: "金融",
  gaming: "游戏",
  design: "设计",
  science: "科学",
  news: "新闻",
  life: "生活",
  other: "其他",
};

const TAG_LABELS: Record<ClassificationTag, string> = {
  openai: "OpenAI",
  claude: "Claude",
  gemini: "Gemini",
  llm: "LLM",
  agent: "Agent",
  mcp: "MCP",
  rag: "RAG",
  java: "Java",
  spring: "Spring",
  react: "React",
  nextjs: "Next.js",
  vue: "Vue",
  database: "Database",
  devops: "DevOps",
  github: "GitHub",
  open_source: "开源",
};

const PERIODS = ["all", "day", "week", "month"] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isTopic(value: string): value is Topic {
  return TOPICS.some((topic) => topic === value);
}

function isTag(value: string): value is ClassificationTag {
  return CLASSIFICATION_TAGS.some((tag) => tag === value);
}

function formatDate(value: Date | null): string {
  if (!value) return "时间未知";
  return `${new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value)} UTC`;
}

function statusLabel(status: string | null): string {
  switch (status) {
    case "CLASSIFIED":
      return "已分类";
    case "PROCESSING":
      return "分类中";
    case "FAILED":
      return "分类失败";
    default:
      return "待分类";
  }
}

function relevanceLabel(score: number | null): string {
  if (score === null) return "暂无评分";
  if (score < 0.25) return "低相关";
  if (score < 0.5) return "一般相关";
  if (score < 0.75) return "较高相关";
  return "高相关";
}

function isTwitterImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pbs.twimg.com";
  } catch {
    return false;
  }
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = first(params.q).trim().slice(0, 120);
  const topicValue = first(params.topic);
  const tagValue = first(params.tag);
  const periodValue = first(params.period);
  const topic = isTopic(topicValue) ? topicValue : undefined;
  const tag = isTag(tagValue) ? tagValue : undefined;
  const period = PERIODS.find((value) => value === periodValue) ?? "all";
  let posts: Awaited<ReturnType<typeof listFeedPosts>> | null = null;
  let unavailable = false;
  try {
    const database = getWebDatabase();
    if (!database) {
      unavailable = true;
    } else {
      posts = await listFeedPosts(database.db, {
        topic,
        tag,
        search: query,
        period: period === "all" ? undefined : period,
        limit: 50,
      });
    }
  } catch {
    unavailable = true;
  }

  return (
    <section className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            X Intelligence / For You
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            信息流
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            最近采集的推荐内容，按主题、标签和相关性整理。
          </p>
        </div>
        <Card size="sm" className="min-w-32 gap-0">
          <CardContent className="gap-1 py-4">
            <p className="text-xs text-muted-foreground">当前结果</p>
            <p className="text-2xl font-semibold tabular-nums">
              {unavailable ? "—" : (posts?.length ?? 0)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / 50
              </span>
            </p>
          </CardContent>
        </Card>
      </header>

      <Card>
        <CardHeader className="gap-1 pb-0">
          <CardTitle className="text-base">筛选帖子</CardTitle>
          <CardDescription>输入关键词，再按主题、标签或时间缩小范围。</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/feed" method="get" className="space-y-5">
            <Field>
              <FieldLabel htmlFor="feed-search">搜索正文或作者</FieldLabel>
              <Input
                id="feed-search"
                type="search"
                name="q"
                maxLength={120}
                defaultValue={query}
                placeholder="输入关键词"
              />
            </Field>

            <FilterPanel className="grid gap-x-5 gap-y-4 md:grid-cols-3">
              <FilterPanelSection title="主题" className="gap-2 pb-0">
                <Select
                  name="topic"
                  defaultValue={topic ?? "all"}
                  items={[
                    { value: "all", label: "全部主题" },
                    ...TOPICS.map((value) => ({
                      value,
                      label: TOPIC_LABELS[value],
                    })),
                  ]}
                >
                  <SelectTrigger className="w-full" aria-label="主题">
                    <SelectValue placeholder="全部主题" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部主题</SelectItem>
                    {TOPICS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {TOPIC_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterPanelSection>

              <FilterPanelSection title="标签" className="gap-2 pb-0">
                <Select
                  name="tag"
                  defaultValue={tag ?? "all"}
                  items={[
                    { value: "all", label: "全部标签" },
                    ...CLASSIFICATION_TAGS.map((value) => ({
                      value,
                      label: TAG_LABELS[value],
                    })),
                  ]}
                >
                  <SelectTrigger className="w-full" aria-label="标签">
                    <SelectValue placeholder="全部标签" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部标签</SelectItem>
                    {CLASSIFICATION_TAGS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {TAG_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterPanelSection>

              <FilterPanelSection title="时间范围" className="gap-2 pb-0">
                <Select
                  name="period"
                  defaultValue={period}
                  items={[
                    { value: "all", label: "全部时间" },
                    { value: "day", label: "最近 24 小时" },
                    { value: "week", label: "最近 7 天" },
                    { value: "month", label: "最近 30 天" },
                  ]}
                >
                  <SelectTrigger className="w-full" aria-label="时间范围">
                    <SelectValue placeholder="全部时间" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部时间</SelectItem>
                    <SelectItem value="day">最近 24 小时</SelectItem>
                    <SelectItem value="week">最近 7 天</SelectItem>
                    <SelectItem value="month">最近 30 天</SelectItem>
                  </SelectContent>
                </Select>
              </FilterPanelSection>
            </FilterPanel>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button type="submit">应用筛选</Button>
              <Button variant="ghost" asChild>
                <Link href="/feed">清除条件</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {unavailable ? (
        <Alert>
          <AlertTitle>暂时无法读取信息流</AlertTitle>
          <AlertDescription>
            请检查服务端数据库连接配置和 PostgreSQL 是否可用。
          </AlertDescription>
        </Alert>
      ) : posts?.length ? (
        <div className="space-y-4">
          {posts.map((post, index) => {
            const score = post.relevanceScore;
            const scorePercent = score === null ? 0 : Math.round(score * 100);
            const imageUrls = post.images
              .filter((image) => isTwitterImageUrl(image.src))
              .slice(0, 3);

            const article = (
              <article key={post.id}>
                <Card className="gap-0 transition-shadow hover:shadow-md">
                  <CardHeader className="gap-3 pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="truncate text-sm font-semibold">
                          {post.authorName ||
                            (post.username ? `@${post.username}` : "X 用户")}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {post.username ? `@${post.username} · ` : ""}
                          {formatDate(post.publishedAt)}
                          {post.lang ? ` · ${post.lang}` : ""}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {post.topic ? (
                          <Badge variant="secondary">
                            {TOPIC_LABELS[post.topic]}
                          </Badge>
                        ) : null}
                        <Badge
                          variant={
                            post.classificationStatus === "FAILED"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {statusLabel(post.classificationStatus)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="gap-4 pt-4">
                    <p className="whitespace-pre-wrap text-[15px] leading-7 [overflow-wrap:anywhere]">
                      {post.text}
                    </p>

                    {post.quotedText ? (
                      <blockquote className="whitespace-pre-wrap border-l-2 border-primary/40 pl-4 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                        {post.quotedText}
                      </blockquote>
                    ) : null}

                    {imageUrls.length ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {imageUrls.map((image) => (
                          <div
                            key={image.src}
                            className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted"
                          >
                            <Image
                              src={image.src}
                              alt={image.alt ?? "推文图片"}
                              fill
                              sizes="(max-width: 640px) 45vw, 240px"
                              className="object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-1.5">
                      {(post.tags ?? []).map((value) => (
                        <Badge key={value} variant="outline" className="font-normal">
                          {isTag(value) ? TAG_LABELS[value] : value}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>

                  <CardFooter className="flex-wrap items-end justify-between gap-4 border-t pt-4">
                    <div className="min-w-40 flex-1 space-y-2">
                      <Progress
                        value={scorePercent}
                        aria-label="相关性评分"
                        className="gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <ProgressLabel className="text-muted-foreground">
                            相关性 · {relevanceLabel(score)}
                          </ProgressLabel>
                          <ProgressValue className="font-medium text-foreground">
                            {() =>
                              score === null ? "—" : `${scorePercent}%`
                            }
                          </ProgressValue>
                        </div>
                      </Progress>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href={post.url} target="_blank" rel="noreferrer">
                        在 X 打开
                        <span aria-hidden="true">↗</span>
                      </a>
                    </Button>
                  </CardFooter>
                </Card>
              </article>
            );

            if (index === 0) return article;
            return (
              <Effect
                key={post.id}
                asChild
                inView
                fade
                slide={{ direction: "up", offset: 12 }}
                blur={{ initialBlur: 2 }}
              >
                {article}
              </Effect>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>没有符合条件的帖子</CardTitle>
            <CardDescription>
              可以清除筛选条件，或先运行一次采集和分类。
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" asChild>
              <Link href="/feed">清除筛选条件</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </section>
  );
}
