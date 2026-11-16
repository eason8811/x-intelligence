"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setFailed(true);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <Alert variant="destructive">
          <AlertTitle>退出登录失败</AlertTitle>
          <AlertDescription>会话未能结束，请稍后重试。</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={signOut}
        className="w-full justify-start"
      >
        <LogOut data-icon="inline-start" />
        {pending ? "正在退出…" : "退出登录"}
      </Button>
    </div>
  );
}
