import type { FeedObservation } from "@x-intelligence/shared";

export interface XCredentials {
  authToken: string;
  csrfToken: string;
}
export interface EntryEvidence {
  postId: string;
  entryId: string | null;
  sortIndex: string | null;
}
export interface FeedPage {
  observations: FeedObservation[];
  evidence: EntryEvidence[];
  cursor: string | null;
  skippedEntries: number;
}
export interface ForYouSource {
  fetchPage(input: {
    count: number;
    cursor?: string;
    signal?: AbortSignal;
  }): Promise<FeedPage>;
}
