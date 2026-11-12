import {
  claimPendingClassifications,
  completePostClassification,
  failPostClassification,
  type DatabaseClient,
} from "@x-intelligence/db";
import {
  ClassifierError,
  type PostClassifier,
} from "@x-intelligence/classifier";
import { TOPICS, type PostClassification } from "@x-intelligence/shared";

export interface ClassificationBatchResult {
  claimed: number;
  classified: number;
  failed: number;
}

export async function classifyPendingBatch(
  db: DatabaseClient,
  classifier: PostClassifier,
  limit: number,
  retryFailed = false,
): Promise<ClassificationBatchResult> {
  const posts = await claimPendingClassifications(db, limit, retryFailed);
  let classified = 0;
  let failed = 0;

  for (const post of posts) {
    let result: PostClassification;
    try {
      result = await classifier.classify(post);
      validateClassification(result);
    } catch (error) {
      await failPostClassification(
        db,
        post.id,
        error instanceof ClassifierError ? error.code : "CLASSIFIER_FAILED",
      );
      failed++;
      continue;
    }

    await completePostClassification(db, post.id, result);
    classified++;
  }

  return { claimed: posts.length, classified, failed };
}

function validateClassification(value: PostClassification): void {
  if (!TOPICS.includes(value.topic)) {
    throw new ClassifierError("INVALID_RESPONSE");
  }
  if (
    !Array.isArray(value.tags) ||
    value.tags.length > 20 ||
    value.tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0)
  ) {
    throw new ClassifierError("INVALID_RESPONSE");
  }
  if (
    !Number.isFinite(value.relevanceScore) ||
    value.relevanceScore < 0 ||
    value.relevanceScore > 1 ||
    typeof value.classifier !== "string" ||
    value.classifier.trim().length === 0 ||
    typeof value.classifierVersion !== "string" ||
    value.classifierVersion.trim().length === 0
  ) {
    throw new ClassifierError("INVALID_RESPONSE");
  }
}
