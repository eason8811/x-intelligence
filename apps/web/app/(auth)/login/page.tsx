import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Login2 } from "@/components/shadcnblocks/login2";
import { getCurrentSession } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main>
      <Login2
        heading="登录工作区"
        description="登录后管理绑定的 X 账号和整理后的 For You 信息流。"
        footer={
          <>
            还没有账号？{" "}
            <Link
              href="/register"
              className="font-medium text-foreground underline underline-offset-4"
            >
              创建账号
            </Link>
          </>
        }
      >
        <AuthForm mode="login" />
      </Login2>
    </main>
  );
}
