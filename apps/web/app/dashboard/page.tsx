import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Database,
  ListChecks,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { getDashboardStats } from "@x-intelligence/db";
import type { ClassificationStatus, Topic } from "@x-intelligence/shared";
import { HydrationSafeEffect, HydrationSafeEffects } from "@/components/hydration-safe-effect";
import { RunStatusBadge } from "@/components/run-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
} from "@/components/ui/progress";
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

const CLASSIFICATION_LABELS: Record<ClassificationStatus, string> = {
  PENDING: "待分类",
  PROCESSING: "分类中",
  CLASSIFIED: "已分类",
  FAILED: "分类失败",
};

const CLASSIFICATION_ICONS = {
  PENDING: CircleDashed,
  PROCESSING: LoaderCircle,
  CLASSIFIED: CheckCircle2,
  FAILED: TriangleAlert,
} satisfies Record<ClassificationStatus, typeof CircleDashed>;

function formatDate(value: Date | null): string {
  if (!value) return "仍在运行";
  return `${new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value)} UTC`;
}

export default async function DashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let databaseUnavailable: "configuration" | "query" | null = null;

  try {
    const database = getWebDatabase();
    if (!database) {
      databaseUnavailable = "configuration";
    } else {
      stats = await getDashboardStats(database.db);
    }
  } catch {
    databaseUnavailable = "query";
  }

  const topicTotal =
    stats?.todayTopicDistribution.reduce((total, item) => total + item.count, 0) ?? 0;
  const classificationTotal = stats
    ? Object.values(stats.todayClassificationCounts).reduce(
        (total, count) => total + count,
        0,
      )
    : 0;

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            X Intelligence / Workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            把推荐流整理成可读的信息收件箱
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            查看数据库中的采集规模、分类进度和最近运行情况。每日统计按 UTC 计算。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/feed">
              浏览信息流
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/runs">
              采集记录
              <ListChecks aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      {databaseUnavailable ? (
        <Alert variant="destructive">
          <AlertTitle>
            {databaseUnavailable === "configuration"
              ? "尚未配置数据库连接"
              : "暂时无法读取统计数据"}
          </AlertTitle>
          <AlertDescription>
            {databaseUnavailable === "configuration"
              ? "请在 Web 服务端配置 DATABASE_URL。"
              : "请检查服务端数据库连接和 PostgreSQL 状态后重试。"}
          </AlertDescription>
        </Alert>
      ) : stats ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <HydrationSafeEffects
              asChild
              inView
              fade
              slide={{ direction: "up", offset: 12 }}
              blur={{ initialBlur: 2 }}
              holdDelay={70}
            >
              {[
              <Card key="today-posts" className="gap-4">
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardDescription>今日采集帖子</CardDescription>
                    <CardTitle className="text-3xl tabular-nums">
                      {stats.todayPostCount.toLocaleString("zh-CN")}
                    </CardTitle>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Activity className="size-5" aria-hidden="true" />
                  </span>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    按今日观察到的去重帖子数统计
                  </p>
                </CardContent>
              </Card>,
              <Card key="total-posts" className="gap-4">
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardDescription>数据库帖子总数</CardDescription>
                    <CardTitle className="text-3xl tabular-nums">
                      {stats.totalPostCount.toLocaleString("zh-CN")}
                    </CardTitle>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <Database className="size-5" aria-hidden="true" />
                  </span>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">已去重保存的 X 帖子</p>
                </CardContent>
              </Card>,
              <Card key="total-runs" className="gap-4">
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardDescription>采集运行总数</CardDescription>
                    <CardTitle className="text-3xl tabular-nums">
                      {stats.totalRunCount.toLocaleString("zh-CN")}
                    </CardTitle>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <Clock3 className="size-5" aria-hidden="true" />
                  </span>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">包含成功、失败和进行中的任务</p>
                </CardContent>
              </Card>,
              ]}
            </HydrationSafeEffects>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <HydrationSafeEffect
              asChild
              inView
              fade
              slide={{ direction: "up", offset: 12 }}
              blur={{ initialBlur: 2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>今日主题分布</CardTitle>
                  <CardDescription>
                    按今日采集且已分类的帖子统计
                  </CardDescription>
                </CardHeader>
                <CardContent className="gap-4">
                  {topicTotal ? (
                    stats.todayTopicDistribution.map(({ topic, count }) => {
                      const percent = Math.round((count / topicTotal) * 100);
                      return (
                        <Progress
                          key={topic}
                          value={percent}
                          aria-label={`${TOPIC_LABELS[topic]}，${count} 条`}
                          className="gap-1.5"
                        >
                          <div className="flex w-full items-center justify-between gap-3 text-sm">
                            <ProgressLabel>{TOPIC_LABELS[topic]}</ProgressLabel>
                            <span className="font-medium tabular-nums">
                              {count.toLocaleString("zh-CN")}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {percent}%
                              </span>
                            </span>
                          </div>
                        </Progress>
                      );
                    })
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground">
                      今天还没有已分类的采集帖子。
                    </p>
                  )}
                </CardContent>
              </Card>
            </HydrationSafeEffect>

            <HydrationSafeEffect
              asChild
              inView
              fade
              slide={{ direction: "up", offset: 12 }}
              blur={{ initialBlur: 2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>今日分类状态</CardTitle>
                  <CardDescription>
                    今日观察到的 {classificationTotal.toLocaleString("zh-CN")} 条帖子
                  </CardDescription>
                </CardHeader>
                <CardContent className="gap-4">
                  {(
                    Object.entries(stats.todayClassificationCounts) as [
                      ClassificationStatus,
                      number,
                    ][]
                  ).map(([status, count]) => {
                    const Icon = CLASSIFICATION_ICONS[status];
                    const percent = classificationTotal
                      ? Math.round((count / classificationTotal) * 100)
                      : 0;
                    return (
                      <div key={status} className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Icon className="size-4" aria-hidden="true" />
                            {CLASSIFICATION_LABELS[status]}
                          </span>
                          <span className="font-medium tabular-nums">
                            {count.toLocaleString("zh-CN")}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {percent}%
                            </span>
                          </span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label={CLASSIFICATION_LABELS[status]}
                          aria-valuemin={0}
                          aria-valuemax={classificationTotal || 1}
                          aria-valuenow={count}
                        >
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </HydrationSafeEffect>
          </div>

          <HydrationSafeEffect
            asChild
            inView
            fade
            slide={{ direction: "up", offset: 12 }}
            blur={{ initialBlur: 2 }}
          >
            <Card>
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>最近采集运行</CardTitle>
                  <CardDescription>按开始时间倒序显示最近 5 次运行</CardDescription>
                </div>
                <Button variant="ghost" asChild>
                  <Link href="/runs">
                    查看全部
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </CardHeader>
              {stats.recentRuns.length ? (
                <CardContent className="gap-0">
                  {stats.recentRuns.map((run, index) => (
                    <div
                      key={run.id}
                      className={`flex flex-wrap items-center justify-between gap-3 py-3 ${
                        index ? "border-t" : ""
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">
                          {formatDate(run.startedAt)}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {run.id}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {run.collectedCount} / {run.targetCount} 条
                        </span>
                        <RunStatusBadge status={run.status} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              ) : (
                <CardContent>
                  <p className="py-3 text-sm text-muted-foreground">
                    数据库中还没有采集运行记录。
                  </p>
                </CardContent>
              )}
            </Card>
          </HydrationSafeEffect>
        </>
      ) : null}
    </section>
  );
}
