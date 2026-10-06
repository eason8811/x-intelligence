import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hasAuthCookies,
  isXHome,
  saveAuthState,
  type AuthState,
} from "./state";

const fixture = (): AuthState => ({
  cookies: ["auth_token", "ct0"].map((name) => ({
    name,
    value: "synthetic-fixture",
    domain: ".x.com",
    path: "/",
    expires: -1,
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
  })),
  origins: [],
});

test("only the HTTPS X home page is accepted", () => {
  assert.equal(isXHome("https://x.com/home?test=1"), true);
  for (const url of [
    "https://x.com/i/flow/login",
    "http://x.com/home",
    "https://x.com.evil.invalid/home",
    "https://example.invalid/home",
  ]) {
    assert.equal(isXHome(url), false);
  }
});

test("missing, empty, expired and wrong-domain auth cookies are rejected", () => {
  assert.equal(hasAuthCookies(fixture()), true);
  assert.equal(hasAuthCookies({ cookies: [], origins: [] }), false);
  for (const patch of [
    { value: "" },
    { expires: 1 },
    { domain: ".evil.invalid" },
  ]) {
    const state = fixture();
    Object.assign(state.cookies[0], patch);
    assert.equal(hasAuthCookies(state), false);
  }
});

test("private atomic save, invalid replacement preserves prior state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "x-auth-test-"));
  const path = join(directory, ".auth", "x.json");
  try {
    await saveAuthState(path, fixture());
    const before = await readFile(path, "utf8");
    assert.deepEqual(JSON.parse(before), fixture());
    if (process.platform !== "win32") {
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      assert.equal((await stat(join(directory, ".auth"))).mode & 0o777, 0o700);
    }
    await assert.rejects(
      saveAuthState(path, { cookies: [], origins: [] }),
      /AUTH_STATE_INVALID/,
    );
    assert.equal(await readFile(path, "utf8"), before);
    const next = fixture();
    next.cookies[0].value = "replacement-fixture";
    await saveAuthState(path, next);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), next);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
