import Link from "next/link";
import { ArrowLeft, Link2 } from "lucide-react";
import { listXAccountsForUser } from "@x-intelligence/db";
import { HydrationSafeEffect, HydrationSafeEffects } from "@/components/hydration-safe-effect";
import { requireCurrentUser } from "@/lib/auth-session";
import { getWebDatabase } from "@/lib/database";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function XAccountsPage() {
  const user = await requireCurrentUser();
  const database = getWebDatabase();
  const accounts = database
    ? await listXAccountsForUser(database.db, user.id)
    : [];

  return (
    <section className="flex flex-col gap-7">
      <HydrationSafeEffect
        asChild
        inView
        fade
        slide={{ direction: "up", offset: 10 }}
        blur={{ initialBlur: 2 }}
      >
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              X Intelligence / Accounts
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">绑定 X 账号</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              管理用于采集 For You 信息流的 X 账号。登录凭据只会在绑定时临时经过浏览器。
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <ArrowLeft data-icon="inline-start" />
              返回概览
            </Link>
          </Button>
        </header>
      </HydrationSafeEffect>

      {accounts.length ? (
        <div className="flex flex-col gap-3">
          <HydrationSafeEffects
            asChild
            inView
            fade
            slide={{ direction: "up", offset: 12 }}
            blur={{ initialBlur: 2 }}
            holdDelay={70}
          >
            {accounts.map((account) => (
              <Card key={account.id}>
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-base">@{account.username}</CardTitle>
                    <CardDescription>
                      绑定于 {account.createdAt.toLocaleDateString("zh-CN", { timeZone: "UTC" })} UTC
                    </CardDescription>
                  </div>
                  <Badge variant={account.status === "CONNECTED" ? "secondary" : "outline"}>
                    {account.status === "CONNECTED" ? "已连接" : "需要重新登录"}
                  </Badge>
                </CardHeader>
              </Card>
            ))}
          </HydrationSafeEffects>
        </div>
      ) : (
        <HydrationSafeEffect
          asChild
          inView
          fade
          slide={{ direction: "up", offset: 12 }}
          blur={{ initialBlur: 2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>尚未绑定 X 账号</CardTitle>
              <CardDescription>
                绑定完成后，采集记录和整理后的帖子只对当前工作区账号可见。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Alert>
                <Link2 />
                <AlertTitle>远程浏览器绑定流程正在接入</AlertTitle>
                <AlertDescription>
                  后续会在本机页面中打开由服务端托管的隔离浏览器。此页面不会收集或保存 X 密码、验证码。
                </AlertDescription>
              </Alert>
              <Button disabled className="w-fit">
                绑定 X 账号
              </Button>
            </CardContent>
          </Card>
        </HydrationSafeEffect>
      )}
    </section>
  );
}
