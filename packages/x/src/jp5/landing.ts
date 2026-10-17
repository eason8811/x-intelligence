import type { XGuestContext } from "./bootstrap";
import { decodeJp5Snapshot } from "./codec";
import { extractJp5LoginState } from "./state";

const URL = "https://jf.x.com/onboarding/web/landing";
const LIMIT = 1024 * 1024;
export class XLandingError extends Error {
  constructor(public readonly code: "X_LANDING_CONFIG" | "X_LANDING_HTTP" | "X_LANDING_REDIRECT" |
    "X_LANDING_CONTENT" | "X_LANDING_SIZE" | "X_LANDING_STATE" | "X_LANDING_NETWORK" |
    "X_LANDING_ABORTED") { super(code); }
}
export interface XLandingRequest {
  url: typeof URL; method: "GET"; headers: Readonly<Record<string, string>>;
  redirect: "manual"; signal: AbortSignal;
}
export interface XLandingResponse {
  url: string; status: number; contentType: string | null;
  setCookies: readonly string[]; bytes: Uint8Array;
}
export type XLandingTransport = (request: XLandingRequest) => Promise<XLandingResponse>;
const fail = (code: XLandingError["code"]): never => { throw new XLandingError(code); };
const fetchLanding: XLandingTransport = async (request) => {
  const response = await fetch(request.url, request);
  const reader = response.body?.getReader();
  try {
    // Refusals are metadata only; do not consume error pages.
    const chunks: Uint8Array[] = []; let length = 0;
    if (response.status === 200 && response.url === URL && reader) {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        length += item.value.byteLength;
        if (length > LIMIT) return fail("X_LANDING_SIZE");
        chunks.push(item.value);
      }
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { url: response.url, status: response.status, contentType: response.headers.get("content-type"),
      setCookies: response.headers.getSetCookie(), bytes };
  } finally { if (reader) { await reader.cancel(); reader.releaseLock(); } }
};
/** Read the account entry only. Public application config must come from an observed frontend build. */
export async function loadXLoginLanding(context: XGuestContext, options: {
  applicationBearer: string; language: string; timezone: string;
  transport?: XLandingTransport; signal?: AbortSignal;
}) {
  if (!/^Bearer [A-Za-z0-9%._~+\/-]{1,4096}$/.test(options.applicationBearer) ||
    !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(options.language)) return fail("X_LANDING_CONFIG");
  try { new Intl.DateTimeFormat("en", { timeZone: options.timezone }); }
  catch { return fail("X_LANDING_CONFIG"); }
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  // Leave cookie, codec and state errors typed and sanitized by their own modules.
  if (signal.aborted) return fail("X_LANDING_ABORTED");
  const headers = Object.freeze({ ...await context.headersFor(URL), authorization: options.applicationBearer,
    "x-jf-v": "JP-5", "x-jf-client-theme": "light", "accept-language": options.language,
    "x-twitter-client-language": options.language, timezone: options.timezone,
    origin: "https://x.com", referer: "https://x.com/" });
  let response: XLandingResponse;
  try {
    response = await (options.transport ?? fetchLanding)({ url: URL, method: "GET", headers, redirect: "manual", signal });
    signal.throwIfAborted();
  } catch (error) {
    if (error instanceof XLandingError) throw error;
    return fail(signal.aborted ? "X_LANDING_ABORTED" : "X_LANDING_NETWORK");
  }
  if (response.url !== URL || (response.status >= 300 && response.status < 400)) return fail("X_LANDING_REDIRECT");
  if (response.status !== 200) return fail("X_LANDING_HTTP");
  if (response.contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "text/plain") return fail("X_LANDING_CONTENT");
  if (response.bytes.byteLength > LIMIT) return fail("X_LANDING_SIZE");
  const state = extractJp5LoginState(decodeJp5Snapshot(response.bytes, "JP-5"));
  if (state.kind !== "ACCOUNT_REQUIRED") return fail("X_LANDING_STATE");
  return { state, context: await context.withResponseCookies(URL, response.setCookies) };
}
