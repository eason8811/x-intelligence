// Offline metadata only. Never prints URLs, headers, cookie values, bodies or identities.
import { readFile, stat } from "node:fs/promises";

async function main() {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) throw new Error("USAGE");
  if ((await stat(file)).size > 128 * 1024 * 1024) throw new Error("SIZE_LIMIT");
  const source = await readFile(file);
  if (source.length > 128 * 1024 * 1024) throw new Error("SIZE_LIMIT");
  const har = JSON.parse(source.toString("utf8"));
  if (!Array.isArray(har?.log?.entries)) throw new Error("INVALID_HAR");
  const entries = har.log.entries;
  const selected = [];
  const scripts = new Set();
  let first = null;
  let initialGt;
  let guestHeadersObserved = 0, guestHeadersMatchingInitialGt = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!["GET", "POST", "OPTIONS", "HEAD", "PUT", "PATCH", "DELETE"].includes(entry.request?.method) ||
      !Number.isInteger(entry.response?.status) || entry.response.status < 0 || entry.response.status > 599)
      throw new Error("INVALID_METADATA");
    const url = new URL(entry.request.url);
    if (!(url.hostname === "api.twitter.com" || url.hostname === "x.com" || url.hostname.endsWith(".x.com") || url.hostname === "abs.twimg.com" || url.hostname === "edge.prelude.dev")) continue;
    const headers = entry.request.headers ?? [];
    const cookieValues = headers.filter((h) => h.name.toLowerCase() === "cookie").map((h) => h.value).join(";");
    const cookieNames = new Set((entry.request.cookies ?? []).map((c) => c.name));
    for (const part of cookieValues.split(";")) cookieNames.add(part.trim().split("=", 1)[0]);
    const guestCookiePresent = cookieNames.has("gt") || cookieNames.has("guest_id");
    const guestHeaderPresent = headers.some((h) => h.name.toLowerCase() === "x-guest-token");
    if (first === null && url.hostname === "x.com" && entry.request.method === "GET" && url.pathname === "/") {
      const responseCookies = new Map((entry.response.cookies ?? []).map((c) => [c.name, c.value]));
      for (const h of entry.response.headers ?? []) {
        if (h.name.toLowerCase() !== "set-cookie") continue;
        const pair = h.value.split(";", 1)[0], split = pair.indexOf("=");
        if (split > 0) responseCookies.set(pair.slice(0, split), pair.slice(split + 1));
      }
      initialGt = responseCookies.get("gt");
      first = { ordinal: index, guestCookiePresent, guestHeaderPresent,
        responseStatus: entry.response.status,
        responseGtNonempty: typeof initialGt === "string" && initialGt.length > 0,
        responseGuestIdNonempty: Boolean(responseCookies.get("guest_id")),
        responseCt0Nonempty: Boolean(responseCookies.get("ct0")) };
    }
    if (guestHeaderPresent) {
      guestHeadersObserved++;
      if (initialGt && headers.some((h) => h.name.toLowerCase() === "x-guest-token" && h.value === initialGt))
        guestHeadersMatchingInitialGt++;
    }
    let kind;
    if ((url.hostname === "api.x.com" || url.hostname === "api.twitter.com") && url.pathname === "/1.1/guest/activate.json") kind = "guest_activation";
    if (url.hostname === "jf.x.com" && url.pathname === "/onboarding/web/landing") kind = "landing";
    if (url.hostname === "edge.prelude.dev" && url.pathname === "/v1/signals") kind = "prelude_signals";
    if (url.hostname === "abs.twimg.com") {
      if (/\/(castle\.umd-|sign\.o-|signals-)[^/]+\.js$/.test(url.pathname)) scripts.add(url.pathname.includes("castle.umd-") ? "castle" : url.pathname.includes("sign.o-") ? "transaction" : "prelude");
    }
    if (kind && entry.request.method !== "OPTIONS") selected.push({ ordinal: index, kind,
      method: entry.request.method, status: entry.response.status, guestCookiePresent, guestHeaderPresent });
  }
  console.log(JSON.stringify({ schema: "x-login-context-metadata/v1", entries: entries.length,
    firstHomepage: first, guestHeadersObserved, guestHeadersMatchingInitialGt, observedScriptKinds: [...scripts].sort(), selected,
    scope: "historical-recorded-metadata-only", cleanBootstrapProven: false }, null, 2));
}
main().catch(() => { console.error("LOGIN_CONTEXT_SUMMARY_FAILED: check HAR path, size and format."); process.exitCode = 1; });
