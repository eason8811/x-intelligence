import { ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { HydrationSafeEffect } from "@/components/hydration-safe-effect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RunsPage() {
  return (
    <section className="space-y-7">
      <header className="max-w-2xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          X Intelligence / Operations
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          采集记录
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          查看已执行采集任务的数量、状态和错误信息。
        </p>
      </header>

      <HydrationSafeEffect
        asChild
        inView
        fade
        slide={{ direction: "up", offset: 12 }}
        blur={{ initialBlur: 2 }}
      >
        <div className="max-w-3xl">
          <Card>
            <CardHeader>
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Clock3 className="size-5" aria-hidden="true" />
              </span>
              <CardTitle>运行记录查询尚未接入</CardTitle>
              <CardDescription className="leading-6">
                当前页面没有连接采集运行记录的数据查询，因此不会展示模拟任务或状态。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTitle>采集结果仍可在信息流中查看</AlertTitle>
                <AlertDescription>
                  运行记录页面接入后会在这里显示任务状态与错误详情。
                </AlertDescription>
              </Alert>
              <Button variant="outline" asChild>
                <Link href="/feed">
                  前往信息流
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </HydrationSafeEffect>
    </section>
  );
}
