import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadXCredentials } from "./credentials";

test("credential reader accepts only valid X cookies and sanitizes failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "x-probe-auth-"));
  const path = join(directory, "state.json");
  try {
    await assert.rejects(loadXCredentials(path), /AUTH_STATE_MISSING/);
    await writeFile(path, "malformed-private-fixture");
    await assert.rejects(
      loadXCredentials(path),
      (error) =>
        error instanceof Error && error.message === "AUTH_STATE_INVALID",
    );
    const state = {
      cookies: ["auth_token", "ct0"].map((name) => ({
        name,
        value: `synthetic-${name}`,
        domain: ".x.com",
        path: "/",
        expires: -1,
      })),
    };
    await writeFile(path, JSON.stringify(state));
    assert.deepEqual(await loadXCredentials(path), {
      authToken: "synthetic-auth_token",
      csrfToken: "synthetic-ct0",
    });
    state.cookies[0].domain = ".example.invalid";
    await writeFile(path, JSON.stringify(state));
    await assert.rejects(loadXCredentials(path), /AUTH_STATE_INVALID/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
