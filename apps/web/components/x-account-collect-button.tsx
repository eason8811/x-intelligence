"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

type JobStatus = "idle" | "starting" | "RUNNING" | "SUCCESS" | "FAILED";

interface CollectionJobResponse {
  jobId?: string;
  status?: "RUNNING" | "SUCCESS" | "FAILED";
  collectedCount?: number;
  errorCode?: string;
  code?: string;
}

const collectionErrorMessages: Record<string, string> = {
  COLLECTION_ALREADY_RUNNING: "该账号已有采集任务正在运行。",
  COLLECTION_FAILED: "采集失败。请查看采集记录中的安全错误码。",
  ACCOUNT_NOT_FOUND: "找不到这个已连接账号。",
  ACCOUNT_SESSION_INVALID: "账号会话无效，请重新绑定 X 账号。",
  ACCOUNT_IDENTITY_MISMATCH: "会话对应的 X 账号已变化，请重新绑定。",
  X_VIEWER_UNAVAILABLE: "X 暂时无法确认账号状态，请稍后重试。",
  X_VIEWER_IDENTITY_MISSING: "X 未返回可验证的账号信息，请重新绑定。",
  COLLECTION_SERVICE_UNAVAILABLE: "采集服务暂时不可用，请稍后重试。",
};

export function XAccountCollectButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [collectedCount, setCollectedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async (id: string, signal: AbortSignal) => {
    try {
      const response = await fetch(
        `/api/x-accounts/${encodeURIComponent(accountId)}/collections?jobId=${encodeURIComponent(id)}`,
        { cache: "no-store", signal },
      );
      const result = await response.json() as CollectionJobResponse;
      if (!response.ok || !result.status) {
        setError(collectionErrorMessages[result.code || ""] || "无法读取采集状态，请刷新后查看采集记录。");
        setStatus("FAILED");
        setJobId(null);
        return false;
      }
      setStatus(result.status);
      if (result.status === "SUCCESS") {
        setCollectedCount(result.collectedCount ?? 0);
        setError(null);
        setJobId(null);
        router.refresh();
        return false;
      }
      if (result.status === "FAILED") {
        setError(collectionErrorMessages[result.errorCode || ""] || "采集失败。请查看采集记录中的安全错误码。");
        setJobId(null);
        return false;
      }
      return true;
    } catch {
      if (!signal.aborted) {
        setError("暂时无法读取采集状态，请稍后刷新页面。");
        setStatus("FAILED");
        setJobId(null);
      }
      return false;
    }
  }, [accountId, router]);

  useEffect(() => {
    if (!jobId || status !== "RUNNING") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = async () => {
      const keepPolling = await poll(jobId, controller.signal);
      if (keepPolling && !controller.signal.aborted) {
        timer = setTimeout(() => void schedule(), 1_500);
      }
    };
    timer = setTimeout(() => void schedule(), 1_000);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId, poll, status]);

  const startCollection = async () => {
    setStatus("starting");
    setError(null);
    setCollectedCount(null);
    try {
      const response = await fetch(`/api/x-accounts/${encodeURIComponent(accountId)}/collections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      const result = await response.json() as CollectionJobResponse;
      if (!response.ok || !result.jobId) {
        setError(collectionErrorMessages[result.code || ""] || "无法启动采集，请稍后重试。");
        setStatus("FAILED");
        return;
      }
      setJobId(result.jobId);
      setStatus("RUNNING");
    } catch {
      setError(collectionErrorMessages.COLLECTION_SERVICE_UNAVAILABLE);
      setStatus("FAILED");
    }
  };

  const busy = status === "starting" || status === "RUNNING";
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" onClick={() => void startCollection()} disabled={busy}>
        {status === "starting" ? "正在启动…" : status === "RUNNING" ? "正在采集…" : "采集 For You"}
      </Button>
      {status === "SUCCESS" && collectedCount !== null ? (
        <p className="text-xs text-muted-foreground">最近一次请求采集到 {collectedCount} 条帖子。</p>
      ) : null}
      {error ? (
        <Alert variant="destructive" className="max-w-xl">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
