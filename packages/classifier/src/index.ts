import type { XPost, PostClassification } from "@x-intelligence/shared";
export type { PostClassification } from "@x-intelligence/shared";
export interface PostClassifier {
  classify(post: XPost): Promise<PostClassification>;
}
