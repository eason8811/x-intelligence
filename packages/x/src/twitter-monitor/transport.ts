import { XSourceError } from "./errors";
import type { XCredentials } from "./types";

export type HomeTimelineCall = (input: {
  cookie: { auth_token: string; ct0: string };
  count: number;
  cursor: string;
  isForYou: true;
}) => Promise<unknown>;

export function validateCredentials(credentials: XCredentials): void {
  const cookieValue = /^[^\s;,]+$/;
  if (
    !cookieValue.test(credentials.authToken) ||
    !cookieValue.test(credentials.csrfToken)
  ) {
    throw new XSourceError("AUTH_STATE_INVALID");
  }
}

async function upstreamCall(
  input: Parameters<HomeTimelineCall>[0],
): Promise<unknown> {
  const { postHomeTimeLine } =
    await import("./vendor/upstream/libs/core/Core.fetch.mjs");
  return postHomeTimeLine(input);
}

function errorCode(error: unknown): XSourceError {
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const original =
    value.e && typeof value.e === "object"
      ? (value.e as Record<string, unknown>)
      : {};
  const response =
    original.response && typeof original.response === "object"
      ? (original.response as Record<string, unknown>)
      : {};
  const status = response.status;
  if (status === 401 || [32, 89, 215].includes(value.code as number))
    return new XSourceError("AUTH_EXPIRED");
  if (status === 403) return new XSourceError("ACCESS_DENIED");
  if (status === 429 || value.code === 429 || value.code === 88)
    return new XSourceError("RATE_LIMITED");
  if (status === 404 || status === 400)
    return new XSourceError("QUERY_UNAVAILABLE");
  if (
    ["ETIMEDOUT", "ECONNABORTED"].includes(String(original.code)) ||
    value.message === "ECONNABORTED"
  )
    return new XSourceError("TIMEOUT");
  return new XSourceError("NETWORK_FAILED");
}

export async function requestHomeTimeline(
  credentials: XCredentials,
  input: { count: number; cursor?: string; signal?: AbortSignal },
  call: HomeTimelineCall = upstreamCall,
): Promise<unknown> {
  validateCredentials(credentials);
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 20)
    throw new RangeError("count=1..20");
  if (input.signal?.aborted) throw new XSourceError("TIMEOUT");
  // Keep upstream HTTP/TLS unchanged. Abort stops waiting; the underlying request
  // retains its original 30-second timeout and may finish after cancellation.
  let removeAbort = () => {};
  try {
    const pending = call({
      cookie: { auth_token: credentials.authToken, ct0: credentials.csrfToken },
      count: input.count,
      cursor: input.cursor ?? "",
      isForYou: true,
    });
    const abort = new Promise<never>((_, reject) => {
      const onAbort = () => reject(new XSourceError("TIMEOUT"));
      input.signal?.addEventListener("abort", onAbort, { once: true });
      removeAbort = () => input.signal?.removeEventListener("abort", onAbort);
      if (input.signal?.aborted) onAbort();
    });
    const response = await Promise.race([pending, abort]);
    if (!response || typeof response !== "object" || !("data" in response))
      throw new XSourceError("PARSER_FAILED");
    return response.data;
  } catch (error) {
    if (error instanceof XSourceError) throw error;
    throw errorCode(error);
  } finally {
    removeAbort();
  }
}
