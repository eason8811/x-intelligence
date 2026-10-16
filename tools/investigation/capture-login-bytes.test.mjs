import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto, createHash } from "node:crypto";
import vm from "node:vm";

test("capture preserves invalid UTF-8 bytes and original response; excludes requests and unrelated traffic", async () => {
  const source = await readFile(new URL("./capture-login-bytes.js", import.meta.url), "utf8");
  const bytes = Uint8Array.from([0, 255, 254, 128, 13, 10, 239, 191, 189]);
  const saved = [];
  const original = async () => new Response(bytes, { headers: { "content-type": "text/plain" } });
  const context = vm.createContext({
    location: { origin: "https://x.com", href: "https://x.com/" },
    fetch: original, URL, Blob, Uint8Array, crypto: webcrypto,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    document: { createElement: () => ({ click() {} }) },
    setTimeout: (callback) => callback(), console: { info() {}, warn() {} },
  });
  // Keep URL's static methods isolated from the host URL object.
  class LocalURL extends URL {}
  LocalURL.createObjectURL = (blob) => { saved.push(blob); return "blob:test"; };
  LocalURL.revokeObjectURL = () => {};
  context.URL = LocalURL;
  vm.runInContext(source, context);
  const response = await context.fetch("https://jf.x.com/onboarding/web/actions/begin_login", {
    method: "POST", body: "password=TEST_SECRET", headers: { authorization: "TEST_SECRET" },
  });
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  const text = await saved[0].text();
  const record = JSON.parse(text);
  assert.deepEqual(Buffer.from(record.body_base64, "base64"), Buffer.from(bytes));
  assert.equal(record.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(text.includes("TEST_SECRET"), false);
  await context.fetch("https://example.com/onboarding/web/actions/begin_login");
  assert.equal(saved.length, 1);
  await context.fetch("https://jf.x.com/onboarding/web/landing");
  const landing = JSON.parse(await saved[1].text());
  assert.equal(landing.action, "landing");
  assert.deepEqual(Buffer.from(landing.body_base64, "base64"), Buffer.from(bytes));
  await context.fetch("https://jf.x.com/onboarding/web/landing", { method: "POST" });
  await context.fetch("https://jf.x.com/onboarding/web/landing-extra");
  await context.fetch("https://example.com/onboarding/web/landing");
  assert.equal(saved.length, 2);
  context.xLoginBytes.stop();
  assert.equal(context.fetch, original);
  assert.equal(context.xLoginBytes, undefined);
});
