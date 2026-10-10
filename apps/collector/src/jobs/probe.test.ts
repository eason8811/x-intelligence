import test from "node:test";
import assert from "node:assert/strict";
import type { FeedPage, ForYouSource } from "@x-intelligence/x";
import { probeForYou } from "./probe";

function page(ids: string[], cursor: string | null): FeedPage {
  return {
    observations: ids.map((id, index) => ({
      post: {
        id,
        url: `https://x.com/i/status/${id}`,
        text: "fixture",
        lang: null,
        username: null,
        authorName: null,
        publishedAt: null,
        images: [],
        quotedText: null,
      },
      position: index + 1,
      observedAt: new Date(0),
    })),
    evidence: ids.map((id) => ({
      postId: id,
      entryId: `tweet-${id}`,
      sortIndex: null,
    })),
    cursor,
    skippedEntries: 0,
  };
}
test("cross-page dedup preserves first observation order and pagination", async () => {
  const pages = [page(["3", "1"], "next"), page(["1", "2"], null)];
  let calls = 0;
  const source: ForYouSource = {
    async fetchPage(input) {
      assert.equal(input.cursor, calls ? "next" : undefined);
      return pages[calls++];
    },
  };
  const result = await probeForYou(source, 10, 2);
  assert.deepEqual(
    result.observations.map((item) => item.post.id),
    ["3", "1", "2"],
  );
  assert.deepEqual(
    result.observations.map((item) => item.position),
    [1, 2, 3],
  );
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.stopReason, "NO_CURSOR");
});
test("repeated cursors and no new posts terminate within bounds", async () => {
  let calls = 0;
  const repeated: ForYouSource = {
    async fetchPage() {
      return page([String(++calls)], "same");
    },
  };
  assert.equal(
    (await probeForYou(repeated, 10, 3)).stopReason,
    "REPEATED_CURSOR",
  );
  assert.equal(calls, 2);
  const unchanged: ForYouSource = {
    async fetchPage() {
      return page(["1"], "next");
    },
  };
  assert.equal(
    (await probeForYou(unchanged, 10, 3)).stopReason,
    "NO_NEW_POSTS",
  );
  await assert.rejects(probeForYou(repeated, 100, 10), /count=1..20/);
});
