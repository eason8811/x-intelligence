import {
  beginPostClassificationAttempt,
  claimPendingClassifications,
  completePostClassificationAttempt,
  failPostClassificationAttempt,
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

  for (const { post, attemptNumber } of posts) {
    const request = classifier.prepareRequest(post);
    const attemptId = await beginPostClassificationAttempt(db, {
      postId: post.id,
      attemptNumber,
      provider: request.provider,
      classifier: request.classifier,
      modelRequested: request.model,
      requestSnapshot: {
        endpoint: request.endpoint,
        method: request.method,
        timeoutMs: request.timeoutMs,
        headers: request.headers,
        body: request.body,
      },
    });

    let responseSnapshot: unknown | null = null;
    let result: PostClassification;
    try {
      responseSnapshot = await classifier.sendRequest(request);
      result = classifier.parseResponse(responseSnapshot);
      validateClassification(result);
    } catch (error) {
      await failPostClassificationAttempt(db, {
        attemptId,
        postId: post.id,
        errorCode:
          error instanceof ClassifierError ? error.code : "CLASSIFIER_FAILED",
        modelReturned: getResponseModel(responseSnapshot),
        responseSnapshot,
      });
      failed++;
      continue;
    }

    await completePostClassificationAttempt(db, {
      attemptId,
      postId: post.id,
      modelReturned: result.classifierVersion,
      responseSnapshot,
      classification: result,
    });
    classified++;
  }

  return { claimed: posts.length, classified, failed };
}

function getResponseModel(response: unknown): string | null {
  if (
    typeof response === "object" &&
    response !== null &&
    !Array.isArray(response) &&
    "model" in response &&
    typeof response.model === "string"
  ) {
    return response.model;
  }
  return null;
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
