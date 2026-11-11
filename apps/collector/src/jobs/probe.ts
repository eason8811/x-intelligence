import type {
  EntryEvidence,
  FeedObservation,
  ForYouSource,
} from "@x-intelligence/x";

export interface ProbeResult {
  observations: FeedObservation[];
  evidence: (EntryEvidence & { page: number })[];
  pagesFetched: number;
  duplicateCount: number;
  skippedEntries: number;
  stopReason: "MAX_PAGES" | "NO_CURSOR" | "REPEATED_CURSOR" | "NO_NEW_POSTS";
}

export async function probeForYou(
  source: ForYouSource,
  count = 10,
  pages = 1,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 20 ||
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 3
  ) {
    throw new RangeError("count=1..20, pages=1..3");
  }
  const result: ProbeResult = {
    observations: [],
    evidence: [],
    pagesFetched: 0,
    duplicateCount: 0,
    skippedEntries: 0,
    stopReason: "MAX_PAGES",
  };
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let index = 0; index < pages; index++) {
    const page = await source.fetchPage({ count, cursor, signal });
    result.pagesFetched++;
    result.skippedEntries += page.skippedEntries;
    let added = 0;
    for (const observation of page.observations) {
      if (seen.has(observation.post.id)) {
        result.duplicateCount++;
        continue;
      }
      seen.add(observation.post.id);
      added++;
      result.observations.push({
        ...observation,
        position: result.observations.length + 1,
      });
      const evidence = page.evidence.find(
        (item) => item.postId === observation.post.id,
      );
      if (evidence) result.evidence.push({ ...evidence, page: index + 1 });
    }
    if (!added) {
      result.stopReason = "NO_NEW_POSTS";
      break;
    }
    if (!page.cursor) {
      result.stopReason = "NO_CURSOR";
      break;
    }
    if (cursors.has(page.cursor)) {
      result.stopReason = "REPEATED_CURSOR";
      break;
    }
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
  return result;
}
