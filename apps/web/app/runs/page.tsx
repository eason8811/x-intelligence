import Link from "next/link";
import { ArrowRight, Clock3, ListChecks } from "lucide-react";
import { listFeedRuns } from "@x-intelligence/db";
import { HydrationSafeEffects } from "@/components/hydration-safe-effect";
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
import { getWebDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

const RUNS_LIMIT = 50;

function formatDate(value: Date | null): string {
  if (!value) return "进行中";
  return `${new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value)} UTC`;
}

function formatDuration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return "运行中";
  const totalSeconds = Math.max(
    0,
    Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000),
  );
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
}

export default async function RunsPage() {
  let runs: Awaited<ReturnType<typeof listFeedRuns>> | null = null;
  let databaseUnavailable: "configuration" | "query" | null = null;

  try {
    const database = getWebDatabase();
    if (!database) {
      databaseUnavailable = "configuration";
    } else {
      runs = await listFeedRuns(database.db, RUNS_LIMIT);
    }
  } catch {
    databaseUnavailable = "query";
  }

  return (
    <section className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            X Intelligence / Operations
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            采集记录
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            查看最近 {RUNS_LIMIT} 次采集任务的状态、采集数量和安全错误码。
          </p>
        </div>
        <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
      </header>

      {databaseUnavailable ? (
        <Alert variant="destructive">
          <AlertTitle>
            {databaseUnavailable === "configuration"
              ? "尚未配置数据库连接"
              : "暂时无法读取采集记录"}
          </AlertTitle>
          <AlertDescription>
            {databaseUnavailable === "configuration"
              ? "请在 Web 服务端配置 DATABASE_URL。"
              : "请检查服务端数据库连接和 PostgreSQL 状态后重试。"}
          </AlertDescription>
        </Alert>
      ) : runs?.length ? (
        <div className="space-y-4">
          <HydrationSafeEffects
            asChild
            inView
            fade
            slide={{ direction: "up", offset: 12 }}
            blur={{ initialBlur: 2 }}
            holdDelay={70}
          >
            {runs.map((run) => (
            <Card key={run.id} className="gap-0">
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 pb-4">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
                    采集运行
                  </CardTitle>
                  <CardDescription className="font-mono text-xs [overflow-wrap:anywhere]">
                    {run.id}
                  </CardDescription>
                </div>
                <RunStatusBadge status={run.status} />
              </CardHeader>
              <CardContent className="gap-4 border-t pt-4">
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">采集帖子</dt>
                    <dd className="font-medium tabular-nums">
                      {run.collectedCount} / {run.targetCount}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">滚动次数</dt>
                    <dd className="font-medium tabular-nums">{run.scrollCount}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">开始时间</dt>
                    <dd className="text-sm">{formatDate(run.startedAt)}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">结束时间</dt>
                    <dd className="text-sm">{formatDate(run.finishedAt)}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">耗时</dt>
                    <dd className="text-sm">
                      {formatDuration(run.startedAt, run.finishedAt)}
                    </dd>
                  </div>
                </dl>
                {run.errorMessage ? (
                  <Alert variant="destructive">
                    <AlertTitle>采集错误</AlertTitle>
                    <AlertDescription>
                      安全错误码：<code>{run.errorMessage}</code>
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
            ))}
          </HydrationSafeEffects>
        </div>
      ) : runs ? (
        <Card>
          <CardHeader>
            <CardTitle>还没有采集运行记录</CardTitle>
            <CardDescription>
              运行采集任务后，状态和采集数量会显示在这里。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/feed">
                前往信息流
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
