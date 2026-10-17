import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapXGuest } from "./bootstrap";
import { loadXLoginLanding, XLandingError, type XLandingResponse } from "./landing";
const u = (value: number): number[] => {
  const bytes: number[] = [];
  do { const part = value % 128; value = Math.floor(value / 128); bytes.push(part | (value ? 128 : 0)); } while (value);
  return bytes;
};
const str = (text: string): number[] => {
  const bytes = [...new TextEncoder().encode(text)]; return [...u(bytes.length), ...bytes];
};
const frame = (payload: number[]): number[] => {
  const header = new Uint8Array(4); new DataView(header.buffer).setUint32(0, payload.length, true);
  return [...header, ...payload];
};
// Synthetic direct landing root -> child -> account form, no recorded private data.
const data = (): number[] => [0, 2,
  0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
  0, 0, 1, 1, 0, 1, 0, 0, 0,
  2, 3, 0,
  30, ...str("/onboarding/web/actions/begin_login"), 1, ...str("username_or_email"), ...str(""),
  0, ...str(""), 0,
  0, 0, 0, 0];
const ready = [1, 0, 0];
const response = (payload = data()): Uint8Array => Uint8Array.from([...frame(payload), ...frame(ready)]);

const options = { applicationBearer: "Bearer public-synthetic", language: "en", timezone: "Asia/Shanghai" };
const url = "https://jf.x.com/onboarding/web/landing";
const makeContext = () => bootstrapXGuest({ transport: async () => ({ url: "https://x.com/", status: 200,
  contentType: "text/html", setCookies: ["gt=synthetic; Domain=.x.com; Path=/; Secure"] }) });
const base: XLandingResponse = { url, status: 200, contentType: "text/plain", bytes: response(),
  setCookies: ["gt=rotated; Domain=.x.com; Path=/; Secure"] };
test("landing uses the fresh guest and returns a decoded account entry with forked cookies", async () => {
  const context = await makeContext(); let calls = 0;
  const result = await loadXLoginLanding(context, { ...options, transport: async (request) => {
    calls++; assert.equal(request.url, url); assert.equal(request.method, "GET");
    assert.equal(request.redirect, "manual"); assert.equal(request.headers["x-guest-token"], "synthetic");
    assert.equal(request.headers["x-jf-client-theme"], "light");
    assert.equal(request.headers.timezone, options.timezone); return base;
  } });
  assert.equal(calls, 1); assert.equal(result.state.kind, "ACCOUNT_REQUIRED");
  assert.equal((await result.context.headersFor(url))["x-guest-token"], "rotated");
  assert.equal((await context.headersFor(url))["x-guest-token"], "synthetic");
});
test("landing refusal and invalid config stop without retry or cookie changes", async () => {
  const context = await makeContext();
  for (const [patch, code] of [
    [{ status: 403 }, "X_LANDING_HTTP"], [{ status: 302 }, "X_LANDING_REDIRECT"],
    [{ url: "https://example.com/" }, "X_LANDING_REDIRECT"],
    [{ contentType: "text/html" }, "X_LANDING_CONTENT"],
    [{ bytes: new Uint8Array(1024 * 1024 + 1) }, "X_LANDING_SIZE"],
  ] as const) {
    let calls = 0;
    await assert.rejects(loadXLoginLanding(context, { ...options, transport: async () => {
      calls++; return { ...base, ...patch };
    } }), (e) => e instanceof XLandingError && e.code === code);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const transport = async () => { calls++; return base; };
  for (const patch of [{ applicationBearer: "bad\r\nsecret" }, { timezone: "bad" }, { language: "en\nsecret" }])
    await assert.rejects(loadXLoginLanding(context, { ...options, ...patch, transport }), XLandingError);
  await assert.rejects(loadXLoginLanding(context, { ...options, signal: AbortSignal.abort(), transport }),
    (e) => e instanceof XLandingError && e.code === "X_LANDING_ABORTED");
  assert.equal(calls, 0);
  await assert.rejects(loadXLoginLanding(context, { ...options, transport: async () => { throw Error("SECRET"); } }),
    (e) => e instanceof XLandingError && e.message === "X_LANDING_NETWORK");
  await assert.rejects(loadXLoginLanding(context, { ...options, transport: async () => ({ ...base, bytes: new Uint8Array() }) }));
  assert.equal((await context.headersFor(url))["x-guest-token"], "synthetic");
});
test("default landing transport disables redirects and bounds streamed bytes", async (t) => {
  const context = await makeContext(); let cancelled = false, calls = 0;
  const oversized = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "text/plain" } });
  Object.defineProperty(oversized, "url", { value: url });
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    calls++; assert.equal(input, url); assert.equal(init.redirect, "manual"); return oversized;
  });
  await assert.rejects(loadXLoginLanding(context, options),
    (e) => e instanceof XLandingError && e.code === "X_LANDING_SIZE");
  assert.equal(cancelled, true); assert.equal(calls, 1);
  const valid = new Response(Uint8Array.from(response()).buffer, { headers: { "content-type": "text/plain; charset=utf-8" } });
  Object.defineProperty(valid, "url", { value: url });
  t.mock.method(globalThis, "fetch", async () => valid);
  assert.equal((await loadXLoginLanding(context, options)).state.kind, "ACCOUNT_REQUIRED");
});
