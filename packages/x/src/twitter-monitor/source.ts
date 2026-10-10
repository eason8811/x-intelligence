import { parseHomeTimeline } from "./parser";
import {
  requestHomeTimeline,
  validateCredentials,
  type HomeTimelineCall,
} from "./transport";
import type { ForYouSource, XCredentials } from "./types";

export class TwitterMonitorForYouSource implements ForYouSource {
  constructor(
    private readonly credentials: XCredentials,
    private readonly call?: HomeTimelineCall,
  ) {
    validateCredentials(credentials);
  }
  async fetchPage(input: {
    count: number;
    cursor?: string;
    signal?: AbortSignal;
  }) {
    const payload = await requestHomeTimeline(
      this.credentials,
      input,
      this.call,
    );
    return parseHomeTimeline(payload, new Date());
  }
}
