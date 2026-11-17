import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ACCOUNT_ROWS = [0, 1];

export default function AccountsLoading() {
  return (
    <section className="flex flex-col gap-7" aria-busy="true">
      <p role="status" className="sr-only">
        正在读取 X 账号
      </p>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </header>

      <div className="flex flex-col gap-3" aria-hidden="true">
        {ACCOUNT_ROWS.map((row) => (
          <Card key={row}>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
