import type { XPost } from "@x-intelligence/shared";
import { XSourceError } from "./errors";
import type { FeedPage } from "./types";

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
}
function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function unwrap(value: unknown): ObjectValue {
  const result = object(value);
  return result.__typename === "TweetWithVisibilityResults"
    ? object(result.tweet)
    : result;
}
function bodyText(tweet: ObjectValue): string {
  const note = object(
    object(object(tweet.note_tweet).note_tweet_results).result,
  );
  return string(note.text) ?? string(object(tweet.legacy).full_text) ?? "";
}

function normalizeTweet(value: unknown): XPost | null {
  const tweet = unwrap(value);
  if (["TweetUnavailable", "TweetTombstone"].includes(String(tweet.__typename)))
    return null;
  const legacy = object(tweet.legacy);
  const id = string(tweet.rest_id) ?? string(legacy.id_str);
  if (!id || !/^\d+$/.test(id)) throw new XSourceError("PARSER_FAILED");
  const core = object(tweet.core);
  const user = object(object(core.user_results ?? core.user_result).result);
  const userLegacy = object(user.legacy);
  const userCore = object(user.core);
  const username =
    string(userCore.screen_name) ?? string(userLegacy.screen_name);
  const quoted = unwrap(
    object(tweet.quoted_status_result ?? legacy.quoted_status_result).result,
  );
  const rawDate = string(legacy.created_at);
  const timestamp = rawDate ? Date.parse(rawDate) : NaN;
  const media = array(
    object(legacy.extended_entities).media ?? object(legacy.entities).media,
  );
  return {
    id,
    url: `https://x.com/${username ? encodeURIComponent(username) : "i"}/status/${id}`,
    text: bodyText(tweet),
    lang: string(legacy.lang),
    authorId: string(user.rest_id) ?? string(legacy.user_id_str),
    username,
    authorName: string(userCore.name) ?? string(userLegacy.name),
    publishedAt: Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : null,
    images: media.flatMap((value) => {
      const item = object(value);
      const src = string(item.media_url_https);
      return item.type === "photo" && src
        ? [{ src, alt: string(item.ext_alt_text) }]
        : [];
    }),
    quotedPostId: string(quoted.rest_id) ?? string(legacy.quoted_status_id_str),
    quotedText: Object.keys(quoted).length ? bodyText(quoted) || null : null,
  };
}

export function parseHomeTimeline(
  payload: unknown,
  observedAt = new Date(),
): FeedPage {
  const root = object(payload);
  const errors = array(root.errors);
  if (errors.length) {
    const codes = errors.map((error) => object(error).code);
    if (codes.some((code) => [32, 89, 215].includes(code as number)))
      throw new XSourceError("AUTH_EXPIRED");
    if (codes.includes(88)) throw new XSourceError("RATE_LIMITED");
    throw new XSourceError("GRAPHQL_FAILED");
  }
  const timeline = object(object(object(root.data).home).home_timeline_urt);
  if (!Array.isArray(timeline.instructions))
    throw new XSourceError("PARSER_FAILED");
  const result: FeedPage = {
    observations: [],
    evidence: [],
    cursor: null,
    skippedEntries: 0,
  };
  const seen = new Set<string>();
  function consume(
    value: unknown,
    entryId: string | null,
    sortIndex: string | null,
  ): void {
    const content = object(value);
    if (content.cursorType === "Bottom") {
      result.cursor = string(content.value);
      return;
    }
    const items = array(content.items);
    if (items.length) {
      for (const item of items) {
        const itemObject = object(item);
        consume(
          object(itemObject.item).itemContent ?? itemObject.itemContent,
          string(itemObject.entryId) ?? entryId,
          sortIndex,
        );
      }
      return;
    }
    const item = object(content.itemContent ?? value);
    const tweetResult = object(item.tweet_results).result;
    if (tweetResult === undefined) {
      result.skippedEntries++;
      return;
    }
    const post = normalizeTweet(tweetResult);
    if (!post) {
      result.skippedEntries++;
      return;
    }
    if (seen.has(post.id)) return;
    seen.add(post.id);
    result.observations.push({
      post,
      position: result.observations.length + 1,
      observedAt,
    });
    result.evidence.push({ postId: post.id, entryId, sortIndex });
  }
  for (const value of timeline.instructions) {
    const instruction = object(value);
    const type = instruction.type ?? instruction.__typename;
    if (
      type === "TimelineAddEntries" ||
      type === "TimelineReplaceEntry" ||
      type === "TimelinePinEntry"
    ) {
      const entries =
        type === "TimelineAddEntries"
          ? array(instruction.entries)
          : [instruction.entry];
      for (const value of entries) {
        const entry = object(value);
        consume(entry.content, string(entry.entryId), string(entry.sortIndex));
      }
    } else if (type === "TimelineAddToModule") {
      consume(
        { items: instruction.moduleItems },
        string(instruction.moduleEntryId),
        null,
      );
    } else if (
      type !== "TimelineTerminateTimeline" &&
      type !== "TimelineClearCache"
    ) {
      throw new XSourceError("PARSER_FAILED");
    }
  }
  return result;
}
