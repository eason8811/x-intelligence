import { CookieJar } from "tough-cookie";

const HOME = "https://x.com/";
const LANDING = "https://jf.x.com/onboarding/web/landing";
export class XBootstrapError extends Error {
  constructor(public readonly code: "X_BOOTSTRAP_HTTP" | "X_BOOTSTRAP_REDIRECT" |
    "X_BOOTSTRAP_NETWORK" | "X_BOOTSTRAP_ABORTED" | "X_BOOTSTRAP_COOKIE" |
    "X_BOOTSTRAP_GUEST_MISSING" | "X_BOOTSTRAP_TARGET" | "X_BOOTSTRAP_CONTENT") { super(code); }
}
export interface XBootstrapRequest {
  url: typeof HOME;
  method: "GET";
  headers: Readonly<Record<string, string>>;
  redirect: "manual";
  signal: AbortSignal;
}
export interface XBootstrapResponse {
  url: string;
  status: number;
  contentType: string | null;
  setCookies: readonly string[];
}
export type XBootstrapTransport = (request: XBootstrapRequest) => Promise<XBootstrapResponse>;
export interface XGuestContext {
  /** Contains credentials. Never log, persist or pass to an untrusted transport. */
  headersFor(url: string): Promise<Readonly<Record<string, string>>>;
  /** Apply cookies from a validated response to a new context; this context stays unchanged. */
  withResponseCookies(url: string, cookies: readonly string[]): Promise<XGuestContext>;
}
const fail = (code: XBootstrapError["code"]): never => { throw new XBootstrapError(code); };
const fetchHome: XBootstrapTransport = async (request) => {
  const response = await fetch(request.url, request);
  try {
    return { url: response.url, status: response.status, contentType: response.headers.get("content-type"),
      setCookies: response.headers.getSetCookie() };
  } finally { await response.body?.cancel(); }
};
function target(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { return fail("X_BOOTSTRAP_TARGET"); }
  if (!["https://x.com", "https://jf.x.com", "https://api.x.com"].includes(url.origin) ||
    url.username || url.password || url.hash) return fail("X_BOOTSTRAP_TARGET");
  return url;
}
async function guest(jar: CookieJar, url: string): Promise<string> {
  const cookies = await jar.getCookies(url);
  const tokens = cookies.filter((cookie) => cookie.key === "gt");
  if (tokens.length !== 1 || !/^[\x21-\x7e]{1,4096}$/.test(tokens[0]!.value))
    return fail("X_BOOTSTRAP_GUEST_MISSING");
  // Bootstrap must not silently become an authenticated account session.
  if (cookies.some((cookie) => ["auth_token", "twid"].includes(cookie.key) && cookie.value))
    return fail("X_BOOTSTRAP_COOKIE");
  return tokens[0]!.value;
}
/** One normal homepage GET, an owned empty jar, no retry, SDK, JS execution or login. */
export async function bootstrapXGuest(options: {
  transport?: XBootstrapTransport; signal?: AbortSignal;
} = {}): Promise<XGuestContext> {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  try {
    signal.throwIfAborted();
    const response = await (options.transport ?? fetchHome)({ url: HOME, method: "GET",
      headers: { accept: "text/html" }, redirect: "manual", signal });
    signal.throwIfAborted();
    if ((response.status >= 300 && response.status < 400) || response.url !== HOME)
      return fail("X_BOOTSTRAP_REDIRECT");
    if (response.status !== 200) return fail("X_BOOTSTRAP_HTTP");
    if (response.contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "text/html")
      return fail("X_BOOTSTRAP_CONTENT");
    if (response.setCookies.length > 64 || response.setCookies.some((cookie) => cookie.length > 8192))
      return fail("X_BOOTSTRAP_COOKIE");
    const jar = new CookieJar(undefined, { prefixSecurity: "strict", looseMode: false });
    try {
      for (const cookie of response.setCookies) await jar.setCookie(cookie, HOME);
    } catch { return fail("X_BOOTSTRAP_COOKIE"); }
    const initial = await guest(jar, HOME);
    if (await guest(jar, LANDING) !== initial) return fail("X_BOOTSTRAP_GUEST_MISSING");
    return context(jar);
  } catch (error) {
    if (error instanceof XBootstrapError) throw error;
    return fail(signal.aborted ? "X_BOOTSTRAP_ABORTED" : "X_BOOTSTRAP_NETWORK");
  }
}

function context(jar: CookieJar): XGuestContext {
  return Object.freeze({
    async headersFor(input: string): Promise<Readonly<Record<string, string>>> {
      const url = target(input).href;
      const token = await guest(jar, url);
      return Object.freeze({ cookie: await jar.getCookieString(url), "x-guest-token": token });
    },
    async withResponseCookies(input: string, cookies: readonly string[]): Promise<XGuestContext> {
      const url = target(input).href;
      if (cookies.length > 64 || cookies.some((cookie) => cookie.length > 8192))
        return fail("X_BOOTSTRAP_COOKIE");
      // A fork prevents partial updates and races between independent response branches.
      let next: CookieJar;
      try {
        next = await jar.clone();
        for (const cookie of cookies) await next.setCookie(cookie, url);
      } catch { return fail("X_BOOTSTRAP_COOKIE"); }
      const token = await guest(next, HOME);
      if (await guest(next, LANDING) !== token) return fail("X_BOOTSTRAP_GUEST_MISSING");
      await guest(next, url);
      return context(next);
    },
  });
}
