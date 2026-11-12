import type { XPost, PostClassification } from "@x-intelligence/shared";
export type { PostClassification } from "@x-intelligence/shared";
export interface PostClassifier {
  classify(post: XPost): Promise<PostClassification>;
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
