import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { HydrationSafeEffect } from "@/components/hydration-safe-effect";
import { getCurrentSession } from "@/lib/auth-session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main className="grid min-h-svh place-items-center px-4 py-12">
      <HydrationSafeEffect
        asChild
        inView
        fade
        slide={{ direction: "up", offset: 10 }}
        blur={{ initialBlur: 2 }}
      >
        <Card className="w-full max-w-md">
          <CardHeader className="gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              X Intelligence / Workspace
            </p>
            <CardTitle className="text-2xl">登录工作区</CardTitle>
            <CardDescription>
              登录后管理绑定的 X 账号和整理后的 For You 信息流。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuthForm mode="login" />
          </CardContent>
        </Card>
      </HydrationSafeEffect>
    </main>
  );
}
