import test from "node:test";
import assert from "node:assert/strict";
import { createLoginAdapter } from "./adapter";

test("production entry cannot silently use fixtures or investigation SDKs", () => {
  assert.throws(() => createLoginAdapter().assertAvailable(), /AUTH_RUNTIME_UNAVAILABLE/);
});
