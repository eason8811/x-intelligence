import Link from "next/link";
import { ArrowRight, ListChecks, Newspaper } from "lucide-react";
import { Effects } from "@animate-ui/react/primitives/effects/effect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const destinations = [
  {
    href: "/feed",
    title: "浏览信息流",
    description: "搜索已采集的帖子，并按主题、标签或时间筛选。",
    icon: Newspaper,
    action: "进入信息流",
  },
  {
    href: "/runs",
    title: "查看采集记录",
    description: "查看采集任务记录页面及当前接入状态。",
    icon: ListChecks,
    action: "查看记录",
  },
];

export default function DashboardPage() {
  return (
    <section className="space-y-8">
      <header className="max-w-2xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          X Intelligence / Workspace
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          把推荐流整理成可读的信息收件箱
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          从已保存的帖子开始浏览。主题、标签和相关性用于帮助你更快找到值得阅读的内容。
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Effects
          asChild
          inView
          fade
          slide={{ direction: "up", offset: 12 }}
          blur={{ initialBlur: 2 }}
          holdDelay={90}
        >
          {destinations.map((destination) => {
            const Icon = destination.icon;
            return (
              <div key={destination.href} className="h-full">
                <Card className="h-full gap-5 transition-shadow hover:shadow-md">
                  <CardHeader className="gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="space-y-1.5">
                      <CardTitle className="text-lg">
                        {destination.title}
                      </CardTitle>
                      <CardDescription className="leading-6">
                        {destination.description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" asChild className="w-fit">
                      <Link href={destination.href}>
                        {destination.action}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </Effects>
      </div>

      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        汇总指标尚未接入数据库查询，因此这里不会显示模拟数据。信息流页面展示当前已保存的帖子。
      </p>
    </section>
  );
}
