import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapXGuest, XBootstrapError, type XBootstrapResponse } from "./bootstrap";
const base: XBootstrapResponse = { url: "https://x.com/", status: 200, contentType: "text/html; charset=utf-8",
  setCookies: ["gt=synthetic; Domain=.x.com; Path=/; Secure", "guest_id=synthetic-guest; Domain=.x.com; Path=/; Secure",
    "ct0=; Domain=.x.com; Path=/; Secure", "hostOnly=private; Path=/; Secure"] };
async function rejects(patch: Partial<XBootstrapResponse>, code: string) {
  let calls = 0;
  await assert.rejects(bootstrapXGuest({ transport: async () => { calls++; return { ...base, ...patch }; } }),
    (e) => e instanceof XBootstrapError && e.code === code && e.message === code);
  assert.equal(calls, 1);
}
test("one empty homepage request yields scoped guest headers without executing HTML", async () => {
  let calls = 0;
  const ctx = await bootstrapXGuest({ transport: async (request) => {
    calls++; assert.equal(request.url, "https://x.com/"); assert.equal(request.method, "GET");
    assert.equal(request.redirect, "manual"); assert.deepEqual(request.headers, { accept: "text/html" });
    return base;
  } });
  const headers = await ctx.headersFor("https://jf.x.com/onboarding/web/landing");
  assert.equal(headers["x-guest-token"], "synthetic");
  assert.equal(headers.cookie.includes("hostOnly="), false);
  assert.equal((await ctx.headersFor("https://x.com/")).cookie.includes("hostOnly=private"), true);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(ctx), "{}");
  for (const url of ["https://example.com", "https://x.com.evil.test/", "http://x.com/", "https://u:p@x.com/", "https://x.com/#secret"])
    await assert.rejects(ctx.headersFor(url), XBootstrapError);
});
test("HTTP refusal, redirect, wrong origin and non-HTML stop without retry", async () => {
  await rejects({ status: 403 }, "X_BOOTSTRAP_HTTP");
  await rejects({ status: 429 }, "X_BOOTSTRAP_HTTP");
  await rejects({ status: 302 }, "X_BOOTSTRAP_REDIRECT");
  await rejects({ url: "https://example.com/" }, "X_BOOTSTRAP_REDIRECT");
  await rejects({ contentType: "application/json" }, "X_BOOTSTRAP_CONTENT");
});
test("missing, expired, deleted, host-only and ambiguous guest cookies stop", async () => {
  for (const setCookies of [[], ["gt=; Domain=.x.com; Path=/; Secure"],
    ["gt=synthetic; Domain=.x.com; Path=/; Max-Age=0; Secure"],
    ["gt=synthetic; Domain=.x.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure"],
    ["gt=synthetic; Path=/; Secure"],
    ["gt=synthetic; Domain=.x.com; Path=/onboarding; Secure"],
    ["gt=synthetic; Domain=.x.com; Path=/; Secure", "gt=other; Domain=.x.com; Path=/onboarding; Secure"]])
    await rejects({ setCookies }, "X_BOOTSTRAP_GUEST_MISSING");
  await rejects({ setCookies: ["gt=synthetic; Domain=example.com; Path=/"] }, "X_BOOTSTRAP_COOKIE");
  await rejects({ setCookies: [...base.setCookies, "auth_token=private; Domain=.x.com; Path=/"] }, "X_BOOTSTRAP_COOKIE");
});
test("network errors stay secret and cancellation sends no request", async () => {
  await assert.rejects(bootstrapXGuest({ transport: async () => { throw Error("TEST_SECRET"); } }),
    (e) => e instanceof XBootstrapError && e.message === "X_BOOTSTRAP_NETWORK");
  let calls = 0;
  await assert.rejects(bootstrapXGuest({ signal: AbortSignal.abort(), transport: async () => { calls++; return base; } }),
    (e) => e instanceof XBootstrapError && e.code === "X_BOOTSTRAP_ABORTED");
  assert.equal(calls, 0);
});
test("default transport disables redirects and cancels the unused response body", async (t) => {
  let cancelled = false, calls = 0;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
    headers: [["content-type", "text/html"], ["set-cookie", "gt=synthetic; Domain=.x.com; Path=/; Secure"]],
  });
  Object.defineProperty(response, "url", { value: "https://x.com/" });
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls++; assert.equal(url, "https://x.com/"); assert.equal(options.redirect, "manual");
    assert.deepEqual(options.headers, { accept: "text/html" }); return response;
  });
  const context = await bootstrapXGuest();
  assert.equal((await context.headersFor("https://api.x.com/"))["x-guest-token"], "synthetic");
  assert.equal(calls, 1); assert.equal(cancelled, true);
});
