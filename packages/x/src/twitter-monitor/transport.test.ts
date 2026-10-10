import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { DEFAULT_CIPHERS } from "node:tls";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { requestHomeTimeline } from "./transport";
import { TwitterMonitorForYouSource } from "./source";
import fixture from "./fixtures/home-timeline.json";
import manifest from "./vendor/source-manifest.json";
import patchManifest from "./vendor/local-patches.json";

const credentials = {
  authToken: "synthetic-auth",
  csrfToken: "synthetic-csrf",
};

test("upstream sources match pinned checksums and recorded additive patches", async () => {
  const patches: Record<string, { originalBytes: number; sha256: string }> =
    patchManifest;
  for (const [path, expected] of Object.entries(manifest)) {
    const bytes = await readFile(
      new URL(`./vendor/upstream/${path}`, import.meta.url),
    );
    assert.equal(
      createHash("sha256")
        .update(
          patches[path]
            ? bytes.subarray(0, patches[path].originalBytes)
            : bytes,
        )
        .digest("hex"),
      expected,
      path,
    );
    if (patches[path])
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        patches[path].sha256,
        path,
      );
  }
});

test("original upstream home request uses original HTTP/TLS and cursor, without X network", async () => {
  const adapter = axios.defaults.adapter;
  let calls = 0;
  axios.defaults.adapter = async (config) => {
    calls++;
    assert.match(config.url ?? "", /\/graphql\/[^/]+\/HomeTimeline$/);
    assert.equal(config.method, "post");
    assert.equal(config.headers.get("x-csrf-token"), "synthetic-csrf");
    const body = JSON.parse(config.data);
    assert.equal(body.variables.withCommunity, true);
    assert.equal(body.variables.cursor, "fixture-cursor");
    assert.equal(body.variables.requestContext, undefined);
    assert.equal(config.timeout, 30000);
    assert.notEqual(config.httpsAgent.options.ciphers, DEFAULT_CIPHERS);
    assert.match(config.headers.get("User-Agent") as string, /Chrome\/142/);
    return {
      data: fixture,
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  try {
    const page = await new TwitterMonitorForYouSource(credentials).fetchPage({
      count: 10,
      cursor: "fixture-cursor",
    });
    assert.equal(page.observations.length, 2);
    assert.equal(calls, 1);
  } finally {
    axios.defaults.adapter = adapter;
  }
});

test("adapter sanitizes upstream failures and does not retry", async () => {
  for (const [status, expected] of [
    [401, "AUTH_EXPIRED"],
    [403, "ACCESS_DENIED"],
    [429, "RATE_LIMITED"],
    [404, "QUERY_UNAVAILABLE"],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      requestHomeTimeline(credentials, { count: 10 }, async () => {
        calls++;
        throw {
          e: {
            response: { status },
            config: { privateToken: "must-not-leak" },
          },
        };
      }),
      (error) =>
        error instanceof Error &&
        error.message === expected &&
        !error.message.includes("must-not-leak"),
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    requestHomeTimeline(
      { ...credentials, authToken: "bad;cookie" },
      { count: 10 },
    ),
    /AUTH_STATE_INVALID/,
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    requestHomeTimeline(credentials, { count: 10, signal: abort.signal }),
    /TIMEOUT/,
  );
});
