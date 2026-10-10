import test from "node:test";
import assert from "node:assert/strict";
import fixture from "./fixtures/home-timeline.json";
import { parseHomeTimeline } from "./parser";

test("home entries preserve string IDs, raw order, modules, quotes and long text", () => {
  const observedAt = new Date("2026-10-07T01:00:00Z");
  const page = parseHomeTimeline(fixture, observedAt);
  assert.deepEqual(
    page.observations.map((item) => item.post.id),
    ["9007199254740993", "9007199254740995"],
  );
  assert.deepEqual(
    page.observations.map((item) => item.position),
    [1, 2],
  );
  assert.equal(page.observations[0].post.text, "Full long post");
  assert.equal(page.observations[0].post.quotedPostId, "9007199254740994");
  assert.equal(page.observations[0].post.quotedText, "quoted fixture");
  assert.equal(page.observations[0].post.username, "fixture");
  assert.equal(page.observations[0].post.images[0].alt, "Synthetic image");
  assert.equal(page.observations[0].observedAt, observedAt);
  assert.equal(page.evidence[0].sortIndex, "19000000000000000001");
  assert.equal(page.cursor, "synthetic-next-cursor");
});

test("schema changes, auth errors and rate limits fail explicitly", () => {
  assert.throws(() => parseHomeTimeline({}), /PARSER_FAILED/);
  assert.throws(
    () =>
      parseHomeTimeline({
        errors: [{ code: 89, message: "private response" }],
      }),
    /AUTH_EXPIRED/,
  );
  assert.throws(
    () => parseHomeTimeline({ errors: [{ code: 88 }] }),
    /RATE_LIMITED/,
  );
  assert.throws(
    () => parseHomeTimeline({ errors: [{ code: 999 }] }),
    /GRAPHQL_FAILED/,
  );
  const numericId = structuredClone(fixture) as unknown as Record<
    string,
    unknown
  >;
  const serialized = JSON.stringify(numericId).replaceAll(
    '"rest_id":"9007199254740993"',
    '"rest_id":9007199254740993',
  );
  assert.throws(
    () => parseHomeTimeline(JSON.parse(serialized)),
    /PARSER_FAILED/,
  );
});
