"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CompositionEvent, FormEvent, KeyboardEvent, PointerEvent, WheelEvent } from "react";
import { useRouter } from "next/navigation";
import type { XAccountBindingServerMessage } from "@x-intelligence/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BindingPhase = "idle" | "connecting" | "starting" | "login" | "checking" | "confirm" | "connected" | "collecting" | "complete" | "error";

interface BindingStartResponse {
  bindingId: string;
  ticket: string;
  websocketUrl: string;
}

interface BindingErrorResponse {
  code?: string;
}

const errorMessages: Record<string, string> = {
  INVALID_ORIGIN: "请求来源校验失败，请刷新页面后重试。",
  UNAUTHENTICATED: "登录状态已过期，请重新登录。",
  BINDING_SERVICE_UNAVAILABLE: "远程浏览器服务暂时不可用，请稍后重试。",
  BINDING_ALREADY_ACTIVE: "已有一个绑定会话正在运行，请先完成或关闭它。",
  BROWSER_UNAVAILABLE: "远程浏览器无法启动，请稍后重试。",
  SCREEN_CAPTURE_FAILED: "无法读取远程浏览器画面，请重新启动绑定。",
  OPEN_X_HOME: "请先在远程浏览器完成登录并进入 X 首页，再点击检查登录。",
  LOGIN_INCOMPLETE: "X 登录尚未完成，或会话 Cookie 尚未就绪。",
  X_VIEWER_UNAVAILABLE: "X 暂时无法确认当前登录账号，请稍后重试。",
  X_VIEWER_IDENTITY_MISSING: "无法从 X 响应中识别当前账号，请重新登录后重试。",
  X_ACCOUNT_CHECK_FAILED: "X 账号校验失败，请确认已登录并进入首页。",
  ACCOUNT_CHANGED: "确认期间检测到账号发生变化，请重新检查登录。",
  X_ACCOUNT_ALREADY_BOUND: "这个 X 账号已绑定到另一个工具账号。",
  SERVER_CONFIGURATION_MISSING: "服务端绑定配置不完整，请联系管理员。",
  X_ACCOUNT_SAVE_FAILED: "账号会话未能安全保存，请重试。",
  BINDING_EXPIRED: "绑定会话已超时，请重新启动。",
  CANCELLED: "已取消绑定。",
  COLLECTION_FAILED: "账号已绑定，但首次采集失败；可稍后再次采集。",
  NETWORK_FAILED: "账号已绑定，但首次采集连接失败；可稍后再次采集。",
};

function isServerMessage(value: unknown): value is XAccountBindingServerMessage {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return message.type === "state" && typeof message.status === "string";
}

export function XAccountBinding() {
  const router = useRouter();
  const socketRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [phase, setPhase] = useState<BindingPhase>("idle");
  const [code, setCode] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [collectedCount, setCollectedCount] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [accountConnected, setAccountConnected] = useState(false);

  const releaseImage = useCallback(() => {
    setImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  const closeSocket = useCallback((sendCancel: boolean) => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket?.readyState === WebSocket.OPEN && sendCancel) {
      socket.send(JSON.stringify({ type: "cancel" }));
    }
    socket?.close();
    releaseImage();
  }, [releaseImage]);

  useEffect(() => () => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "cancel" }));
    }
    socket?.close();
  }, []);

  const start = useCallback(async () => {
    closeSocket(false);
    setPhase("connecting");
    setCode(null);
    setUsername(null);
    setCollectedCount(null);
    setAccountConnected(false);
    try {
      const response = await fetch("/api/x-accounts/bindings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = payload as BindingErrorResponse;
        setCode(error.code || "BINDING_SERVICE_UNAVAILABLE");
        setPhase("error");
        return;
      }
      const binding = payload as BindingStartResponse;
      const socket = new WebSocket(binding.websocketUrl);
      socket.binaryType = "blob";
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: "authenticate",
          bindingId: binding.bindingId,
          ticket: binding.ticket,
        }));
      };
      socket.onmessage = (event: MessageEvent<Blob | string>) => {
        if (typeof event.data !== "string") {
          const nextUrl = URL.createObjectURL(event.data);
          setImageUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return nextUrl;
          });
          return;
        }
        let message: unknown;
        try {
          message = JSON.parse(event.data) as unknown;
        } catch {
          return;
        }
        if (!isServerMessage(message)) return;
        setPhase(message.status);
        if (message.code) setCode(message.code);
        if (message.username) setUsername(message.username);
        if (["connected", "collecting", "complete"].includes(message.status)) {
          setAccountConnected(true);
        }
        if (typeof message.collectedCount === "number") {
          setCollectedCount(message.collectedCount);
        }
        if (["connected", "complete"].includes(message.status)) router.refresh();
      };
      socket.onerror = () => {
        setCode("BINDING_SERVICE_UNAVAILABLE");
        setPhase((current) => current === "complete" ? current : "error");
      };
      socket.onclose = () => {
        socketRef.current = null;
        setImageUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        setPhase((current) => ["complete", "error"].includes(current) ? current : "error");
        setCode((current) => current ?? "BINDING_SERVICE_UNAVAILABLE");
      };
      setPhase("starting");
    } catch {
      setCode("BINDING_SERVICE_UNAVAILABLE");
      setPhase("error");
    }
  }, [closeSocket, router]);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 1280;
    const y = ((event.clientY - bounds.top) / bounds.height) * 800;
    sendMessage({ type: "input", action: "click", x, y });
    inputRef.current?.focus({ preventScroll: true });
  }, [sendMessage]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) return;
    if (["Enter", "Tab", "Backspace", "Delete", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      event.preventDefault();
      sendMessage({ type: "input", action: "press", key: event.key });
    }
  }, [sendMessage]);

  const handleInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    if (event.nativeEvent instanceof InputEvent && event.nativeEvent.isComposing) return;
    if (element.value) {
      sendMessage({ type: "input", action: "insertText", text: element.value.slice(0, 512) });
      element.value = "";
    }
  }, [sendMessage]);

  const handleCompositionEnd = useCallback((event: CompositionEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    const value = event.data.slice(0, 512);
    if (value) sendMessage({ type: "input", action: "insertText", text: value });
    element.value = "";
  }, [sendMessage]);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    sendMessage({
      type: "input",
      action: "wheel",
      x: ((event.clientX - bounds.left) / bounds.width) * 1280,
      y: ((event.clientY - bounds.top) / bounds.height) * 800,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  }, [sendMessage]);

  const busy = !["idle", "complete", "error"].includes(phase);
  const isBoundCollectionFailure = phase === "error" && accountConnected;
  const message = code
    ? (errorMessages[code] || (isBoundCollectionFailure
      ? "账号已绑定，但首次采集失败；可稍后再次采集。"
      : "绑定过程未完成，请重新启动后重试。"))
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void start()} disabled={busy}>
          {phase === "complete" ? "再次绑定 X 账号" : "启动远程浏览器"}
        </Button>
        {busy ? (
          <Button type="button" variant="outline" onClick={() => {
            setCode("CANCELLED");
            setPhase("error");
            closeSocket(true);
          }}>
            取消绑定
          </Button>
        ) : null}
        {phase === "login" ? (
          <Button type="button" variant="secondary" onClick={() => sendMessage({ type: "complete" })}>
            检查登录
          </Button>
        ) : null}
        {phase === "confirm" ? (
          <Button type="button" onClick={() => sendMessage({ type: "confirm" })}>
            确认绑定 @{username}
          </Button>
        ) : null}
      </div>

      {busy || phase === "complete" || phase === "error" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {phase === "login" ? "请在远程浏览器中登录 X" :
                phase === "checking" ? "正在核对 X 账号" :
                  phase === "confirm" ? `确认绑定 @${username}` :
                    phase === "connected" ? `已绑定 @${username}` :
                      phase === "collecting" ? `正在采集 @${username} 的 For You 信息流` :
                        phase === "complete" ? `首次采集完成：${collectedCount ?? 0} 条帖子` :
                          phase === "error" ? "绑定状态" : "正在启动远程浏览器"}
            </CardTitle>
            <CardDescription>
              {phase === "login" ? "点击画面中的 X 登录表单，再输入账号信息并处理 X 页面要求的验证。密码和验证码只会临时传送到远程浏览器，不会写入数据库或日志。" :
                phase === "confirm" ? "请核对下方用户名。确认后，服务端会加密保存会话，并请求采集 20 条、1 页（X 实际返回可能超过请求数）。" :
                  phase === "collecting" ? "本次采集有 120 秒上限；不会自动调用分类服务。" :
                    phase === "complete" ? "账号会话已加密保存到数据库；未保存浏览器录像或请求记录。" :
                      busy ? "请保持此页面打开，直到绑定或取消完成。" : ""}
            </CardDescription>
          </CardHeader>
          {imageUrl && phase === "login" ? (
            <CardContent>
              <div
                className="relative w-full touch-none overflow-hidden rounded-md border bg-muted"
                style={{ aspectRatio: "1280 / 800" }}
                onPointerUp={handlePointerUp}
                onWheel={handleWheel}
              >
                {/* The image is a transient viewport stream from the isolated remote browser. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="远程 X 登录浏览器画面" className="absolute inset-0 h-full w-full select-none object-fill" draggable={false} />
                <textarea
                  ref={inputRef}
                  aria-label="向远程 X 登录页面输入内容"
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="absolute bottom-1 left-1 h-8 w-24 resize-none border-0 bg-transparent p-0 text-transparent caret-transparent opacity-[0.01] outline-none"
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                  onCompositionEnd={handleCompositionEnd}
                />
              </div>
            </CardContent>
          ) : null}
          {phase === "error" && message ? (
            <CardContent>
              <Alert variant="destructive">
                <AlertTitle>{isBoundCollectionFailure ? "账号已绑定" : "绑定未完成"}</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            </CardContent>
          ) : null}
          {phase === "complete" ? (
            <CardContent>
              <Alert>
                <AlertTitle>绑定成功</AlertTitle>
                <AlertDescription>
                  @{username} 已连接，采集到 {collectedCount ?? 0} 条帖子。刷新后账号列表会显示最新状态。
                </AlertDescription>
              </Alert>
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
