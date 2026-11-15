"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailed(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      const result = isRegister
        ? await authClient.signUp.email({
            name: String(form.get("name") ?? "").trim(),
            email,
            password,
            callbackURL: "/dashboard",
          })
        : await authClient.signIn.email({
            email,
            password,
            callbackURL: "/dashboard",
          });

      if (result.error) {
        setFailed(true);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {failed ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{isRegister ? "暂时无法创建账号" : "登录失败"}</AlertTitle>
          <AlertDescription>
            请检查邮箱和密码，或稍后重试。
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup className="gap-4">
        {isRegister ? (
          <Field>
            <FieldLabel htmlFor="auth-name">显示名称</FieldLabel>
            <Input
              id="auth-name"
              name="name"
              autoComplete="name"
              maxLength={80}
              required
            />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="auth-email">邮箱</FieldLabel>
          <Input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="auth-password">密码</FieldLabel>
          <Input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={12}
            maxLength={128}
            required
          />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "请稍候…" : isRegister ? "创建账号" : "登录"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isRegister ? "已有账号？" : "还没有账号？"}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-foreground underline underline-offset-4"
        >
          {isRegister ? "返回登录" : "创建账号"}
        </Link>
      </p>
    </form>
  );
}
