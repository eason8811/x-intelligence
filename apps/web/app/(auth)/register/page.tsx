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

export default async function RegisterPage() {
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
            <CardTitle className="text-2xl">创建工作区账号</CardTitle>
            <CardDescription>
              使用邮箱和密码创建工具账号。X 登录凭据会在之后的绑定流程中单独处理。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuthForm mode="register" />
          </CardContent>
        </Card>
      </HydrationSafeEffect>
    </main>
  );
}
