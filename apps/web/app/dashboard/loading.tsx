import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SUMMARY_CARDS = [0, 1, 2];
const TOPIC_ROWS = [0, 1, 2, 3, 4];
const RUN_ROWS = [0, 1, 2];

export default function DashboardLoading() {
  return (
    <section className="space-y-8" aria-busy="true">
      <p role="status" className="sr-only">
        正在读取仪表盘数据
      </p>
      <header className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {SUMMARY_CARDS.map((item) => (
          <Card key={item}>
            <CardHeader className="gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-3 w-36" />
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </CardHeader>
          <CardContent className="gap-5">
            {TOPIC_ROWS.map((item) => (
              <div key={item} className="space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-52 max-w-full" />
          </CardHeader>
          <CardContent className="gap-5">
            {TOPIC_ROWS.slice(0, 4).map((item) => (
              <div key={item} className="space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </CardHeader>
        <CardContent className="gap-4">
          {RUN_ROWS.map((item) => (
            <div
              key={item}
              className="flex flex-wrap items-center justify-between gap-3 border-t py-3 first:border-0"
            >
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
