import {
  beginFeedRun,
  completeFeedRun,
  failFeedRun,
  type DatabaseClient,
} from "@x-intelligence/db";
import {
  XSourceError,
  type ForYouSource,
  type XSourceErrorCode,
} from "@x-intelligence/x";
import { probeForYou, type ProbeResult } from "./probe";

export class PersistedCollectionError extends Error {
  constructor(
    public readonly runId: string,
    public readonly code: XSourceErrorCode | "INVALID_ARGUMENT" | "COLLECTION_FAILED" | "RUN_STATUS_UPDATE_FAILED",
    public readonly causeDetails?: unknown,
  ) {
    super(code);
    this.name = "PersistedCollectionError";
  }
}

export interface CollectionRunResult extends ProbeResult {
  runId: string;
}

export async function collectForYouToDatabase(
  db: DatabaseClient,
  source: ForYouSource,
  count: number,
  pages: number,
  signal?: AbortSignal,
): Promise<CollectionRunResult> {
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

  const runId = await beginFeedRun(db, count * pages);
  try {
    const result = await probeForYou(source, count, pages, signal);
    await completeFeedRun(db, {
      runId,
      observations: result.observations,
      pagesFetched: result.pagesFetched,
    });
    return { ...result, runId };
  } catch (error) {
    const code = safeErrorCode(error);
    try {
      await failFeedRun(db, runId, code);
    } catch (statusError) {
      throw new PersistedCollectionError(
        runId,
        "RUN_STATUS_UPDATE_FAILED",
        [error, statusError],
      );
    }
    throw new PersistedCollectionError(runId, code);
  }
}

function safeErrorCode(
  error: unknown,
): XSourceErrorCode | "INVALID_ARGUMENT" | "COLLECTION_FAILED" {
  if (error instanceof XSourceError) return error.code;
  if (error instanceof RangeError) return "INVALID_ARGUMENT";
  return "COLLECTION_FAILED";
}
