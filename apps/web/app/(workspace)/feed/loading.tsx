import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_POSTS = [0, 1, 2];

export default function FeedLoading() {
  return (
    <section className="space-y-7" aria-busy="true">
      <p role="status" className="sr-only">
        正在加载信息流
      </p>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="w-full max-w-2xl space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Card size="sm" className="min-w-32 gap-0">
          <CardContent className="gap-2 py-4">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-7 w-16" />
          </CardContent>
        </Card>
      </header>

      <Card>
        <CardHeader className="gap-2 pb-0">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {SKELETON_POSTS.map((item) => (
              <div key={item} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t pt-4">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4" aria-hidden="true">
        {SKELETON_POSTS.map((item) => (
          <Card key={item} className="gap-0">
            <CardHeader className="gap-3 pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="gap-4 pt-4">
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[92%]" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardContent>
            <CardFooter className="flex-wrap items-end justify-between gap-4 border-t pt-4">
              <div className="min-w-40 flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-9 w-24 rounded-md" />
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}
