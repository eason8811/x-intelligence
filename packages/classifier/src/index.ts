import type { XPost, PostClassification } from "@x-intelligence/shared";
export type { PostClassification } from "@x-intelligence/shared";

export interface PreparedClassificationRequest {
  provider: string;
  classifier: string;
  model: string;
  endpoint: string;
  method: "POST";
  timeoutMs: number;
  headers: { "Content-Type": "application/json" };
  body: Record<string, unknown>;
}

export interface PostClassifier {
  prepareRequest(post: XPost): PreparedClassificationRequest;
  sendRequest(request: PreparedClassificationRequest): Promise<unknown>;
  parseResponse(response: unknown): PostClassification;
}

export type ClassifierErrorCode =
  | "CONFIG_MISSING"
  | "REQUEST_FAILED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "TIMEOUT";

export class ClassifierError extends Error {
  constructor(public readonly code: ClassifierErrorCode) {
    super(code);
    this.name = "ClassifierError";
  }
}
