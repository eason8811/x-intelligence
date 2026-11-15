import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const RUN_ROWS = [0, 1, 2];
const RUN_METRICS = ["posts", "scrolls", "started", "finished", "duration"];

export default function RunsLoading() {
  return (
    <section className="space-y-7" aria-busy="true">
      <p role="status" className="sr-only">
        正在读取采集记录
      </p>
      <header className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </header>
      {RUN_ROWS.map((item) => (
        <Card key={item} className="gap-0">
          <CardHeader className="flex-row items-start justify-between gap-4 pb-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </CardHeader>
          <CardContent className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-5">
            {RUN_METRICS.map((metric) => (
              <div key={metric} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
