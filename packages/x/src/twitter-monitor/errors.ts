export type XSourceErrorCode =
  | "AUTH_STATE_MISSING"
  | "AUTH_STATE_INVALID"
  | "AUTH_EXPIRED"
  | "RATE_LIMITED"
  | "ACCESS_DENIED"
  | "QUERY_UNAVAILABLE"
  | "NETWORK_FAILED"
  | "TIMEOUT"
  | "GRAPHQL_FAILED"
  | "PARSER_FAILED";

export class XSourceError extends Error {
  constructor(public readonly code: XSourceErrorCode) {
    super(code);
    this.name = "XSourceError";
  }
}
