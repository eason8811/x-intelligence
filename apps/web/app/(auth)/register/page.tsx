import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Signup2 } from "@/components/shadcnblocks/signup2";
import { getCurrentSession } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main>
      <Signup2
        heading="创建工作区账号"
        description="使用邮箱和密码创建工具账号。X 登录凭据会在之后的绑定流程中单独处理。"
        footer={
          <>
            已有账号？{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-4"
            >
              返回登录
            </Link>
          </>
        }
      >
        <AuthForm mode="register" />
      </Signup2>
    </main>
  );
}
