import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type {
  ClassificationTag,
  FeedObservation,
  PostClassification,
  Topic,
  XPost,
} from "@x-intelligence/shared";
import * as schema from "./schema";
export * from "./schema";
// Lazy connection: builds do not require credentials. Caller owns pool cleanup.
export function createDatabase(connectionString: string) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

type Database = ReturnType<typeof createDatabase>["db"];
export type DatabaseClient = Database;

export interface ClaimedClassification {
  post: XPost;
  attemptNumber: number;
}

export interface FeedQueryOptions {
  topic?: Topic;
  tag?: ClassificationTag;
  search?: string;
  period?: "day" | "week" | "month";
  limit?: number;
}

export async function listFeedPosts(
  db: DatabaseClient,
  options: FeedQueryOptions = {},
) {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer from 1 to 100");
  }

  const filters: SQL[] = [];
  if (options.topic) {
    filters.push(eq(schema.postClassification.topic, options.topic));
  }
  if (options.tag) {
    filters.push(
      arrayContains(schema.postClassification.tags, [options.tag]),
    );
  }
  if (options.period === "day") {
    filters.push(
      sql`${schema.xPost.publishedAt} >= now() - interval '1 day'`,
    );
  } else if (options.period === "week") {
    filters.push(
      sql`${schema.xPost.publishedAt} >= now() - interval '7 days'`,
    );
  } else if (options.period === "month") {
    filters.push(
      sql`${schema.xPost.publishedAt} >= now() - interval '30 days'`,
    );
  }
  const search = options.search?.trim().slice(0, 120);
  if (search) {
    const pattern = `%${search}%`;
    const searchFilter = or(
      ilike(schema.xPost.text, pattern),
      ilike(schema.xPost.authorName, pattern),
      ilike(schema.xPost.username, pattern),
    );
    if (searchFilter) filters.push(searchFilter);
  }

  const latestObservation = db
    .select({
      postId: schema.feedObservation.postId,
      observedAt: sql<Date>`max(${schema.feedObservation.observedAt})`.as(
        "observed_at",
      ),
    })
    .from(schema.feedObservation)
    .groupBy(schema.feedObservation.postId)
    .as("latest_observation");

  return db
    .select({
      id: schema.xPost.id,
      url: schema.xPost.url,
      text: schema.xPost.text,
      lang: schema.xPost.lang,
      username: schema.xPost.username,
      authorName: schema.xPost.authorName,
      publishedAt: schema.xPost.publishedAt,
      images: schema.xPost.mediaJson,
      quotedText: schema.xPost.quotedText,
      topic: schema.postClassification.topic,
      tags: schema.postClassification.tags,
      relevanceScore: schema.postClassification.relevanceScore,
      classificationStatus: schema.postClassification.status,
      latestObservedAt: latestObservation.observedAt,
    })
    .from(schema.xPost)
    .leftJoin(
      schema.postClassification,
      eq(schema.postClassification.postId, schema.xPost.id),
    )
    .leftJoin(
      latestObservation,
      eq(latestObservation.postId, schema.xPost.id),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      sql`${latestObservation.observedAt} DESC NULLS LAST`,
      sql`${schema.xPost.publishedAt} DESC NULLS LAST`,
      desc(schema.xPost.createdAt),
    )
    .limit(limit);
}

export async function beginFeedRun(
  db: DatabaseClient,
  targetCount: number,
): Promise<string> {
  if (!Number.isInteger(targetCount) || targetCount < 1) {
    throw new RangeError("targetCount must be a positive integer");
  }
  const [run] = await db
    .insert(schema.feedRun)
    .values({ targetCount })
    .returning({ id: schema.feedRun.id });
  if (!run) throw new Error("FEED_RUN_CREATE_FAILED");
  return run.id;
}

export async function completeFeedRun(
  db: DatabaseClient,
  input: {
    runId: string;
    observations: FeedObservation[];
    pagesFetched: number;
  },
): Promise<void> {
  if (!Number.isInteger(input.pagesFetched) || input.pagesFetched < 0) {
    throw new RangeError("pagesFetched must be a non-negative integer");
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    if (input.observations.length > 0) {
      const posts = input.observations.map(({ post }) => ({
        id: post.id,
        authorId: post.authorId ?? null,
        username: post.username,
        authorName: post.authorName,
        text: post.text,
        lang: post.lang,
        publishedAt: parsePostDate(post.publishedAt),
        url: post.url,
        quotedPostId: post.quotedPostId ?? null,
        quotedText: post.quotedText,
        mediaJson: post.images,
      }));

      await tx
        .insert(schema.xPost)
        .values(posts)
        .onConflictDoUpdate({
          target: schema.xPost.id,
          set: {
            authorId: sql`excluded.author_id`,
            username: sql`excluded.username`,
            authorName: sql`excluded.author_name`,
            text: sql`excluded.text`,
            lang: sql`excluded.lang`,
            publishedAt: sql`excluded.published_at`,
            url: sql`excluded.url`,
            quotedPostId: sql`excluded.quoted_post_id`,
            quotedText: sql`excluded.quoted_text`,
            mediaJson: sql`excluded.media_json`,
            updatedAt: now,
          },
        });

      await tx
        .insert(schema.postClassification)
        .values(input.observations.map(({ post }) => ({ postId: post.id })))
        .onConflictDoNothing({ target: schema.postClassification.postId });

      await tx.insert(schema.feedObservation).values(
        input.observations.map((observation) => ({
          runId: input.runId,
          postId: observation.post.id,
          position: observation.position,
          observedAt: observation.observedAt,
        })),
      );
    }

    await tx
      .update(schema.feedRun)
      .set({
        status: "SUCCESS",
        finishedAt: now,
        collectedCount: input.observations.length,
        scrollCount: Math.max(input.pagesFetched - 1, 0),
        errorMessage: null,
      })
      .where(eq(schema.feedRun.id, input.runId));
  });
}

export async function failFeedRun(
  db: DatabaseClient,
  runId: string,
  errorCode: string,
): Promise<void> {
  await db
    .update(schema.feedRun)
    .set({
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: errorCode.slice(0, 120),
    })
    .where(eq(schema.feedRun.id, runId));
}

export async function claimPendingClassifications(
  db: DatabaseClient,
  limit: number,
  retryFailed = false,
): Promise<ClaimedClassification[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new RangeError("classification limit must be 1..20");
  }

  const eligibleStatuses = retryFailed
    ? (["PENDING", "FAILED"] as const)
    : (["PENDING"] as const);
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ postId: schema.postClassification.postId })
      .from(schema.postClassification)
      .where(inArray(schema.postClassification.status, eligibleStatuses))
      .orderBy(
        asc(schema.postClassification.createdAt),
        asc(schema.postClassification.postId),
      )
      .limit(limit);
    const candidateIds = candidates.map(({ postId }) => postId);
    if (candidateIds.length === 0) return [];

    const claimed = await tx
      .update(schema.postClassification)
      .set({
        status: "PROCESSING",
        retryCount: sql`${schema.postClassification.retryCount} + 1`,
        topic: null,
        tags: [],
        relevanceScore: null,
        classifier: null,
        classifierVersion: null,
        errorMessage: null,
        classifiedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(schema.postClassification.postId, candidateIds),
          inArray(schema.postClassification.status, eligibleStatuses),
        ),
      )
      .returning({
        postId: schema.postClassification.postId,
        attemptNumber: schema.postClassification.retryCount,
      });
    const claimedIds = claimed.map(({ postId }) => postId);
    if (claimedIds.length === 0) return [];

    const attemptNumbers = new Map(
      claimed.map(({ postId, attemptNumber }) => [postId, attemptNumber]),
    );
    const rows = await tx
      .select()
      .from(schema.xPost)
      .where(inArray(schema.xPost.id, claimedIds));
    const positions = new Map(
      candidateIds.map((postId, index) => [postId, index]),
    );
    return rows
      .sort(
        (left, right) =>
          (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .map((row) => {
        const attemptNumber = attemptNumbers.get(row.id);
        if (attemptNumber === undefined) {
          throw new Error("CLASSIFICATION_ATTEMPT_NUMBER_MISSING");
        }
        return { post: toXPost(row), attemptNumber };
      });
  });
}

export async function beginPostClassificationAttempt(
  db: DatabaseClient,
  input: {
    postId: string;
    attemptNumber: number;
    provider: string;
    classifier: string;
    modelRequested: string;
    requestSnapshot: Record<string, unknown>;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [classification] = await tx
      .select({
        status: schema.postClassification.status,
        retryCount: schema.postClassification.retryCount,
      })
      .from(schema.postClassification)
      .where(eq(schema.postClassification.postId, input.postId))
      .for("update");
    if (
      classification?.status !== "PROCESSING" ||
      classification.retryCount !== input.attemptNumber
    ) {
      throw new Error("CLASSIFICATION_STATE_CONFLICT");
    }

    const [attempt] = await tx
      .insert(schema.postClassificationAttempt)
      .values(input)
      .returning({ id: schema.postClassificationAttempt.id });
    if (!attempt) throw new Error("CLASSIFICATION_ATTEMPT_CREATE_FAILED");
    return attempt.id;
  });
}

export async function completePostClassificationAttempt(
  db: DatabaseClient,
  input: {
    attemptId: string;
    postId: string;
    modelReturned: string;
    responseSnapshot: unknown;
    classification: PostClassification;
  },
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [attempt] = await tx
      .update(schema.postClassificationAttempt)
      .set({
        modelReturned: input.modelReturned,
        responseSnapshot: input.responseSnapshot,
        status: "SUCCEEDED",
        errorCode: null,
        completedAt: now,
      })
      .where(
        and(
          eq(schema.postClassificationAttempt.id, input.attemptId),
          eq(schema.postClassificationAttempt.postId, input.postId),
          eq(schema.postClassificationAttempt.status, "PROCESSING"),
        ),
      )
      .returning({ id: schema.postClassificationAttempt.id });
    if (!attempt) throw new Error("CLASSIFICATION_ATTEMPT_STATE_CONFLICT");

    const [updated] = await tx
      .update(schema.postClassification)
      .set({
        topic: input.classification.topic,
        tags: input.classification.tags,
        relevanceScore: input.classification.relevanceScore,
        classifier: input.classification.classifier,
        classifierVersion: input.classification.classifierVersion,
        status: "CLASSIFIED",
        errorMessage: null,
        classifiedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.postClassification.postId, input.postId),
          eq(schema.postClassification.status, "PROCESSING"),
        ),
      )
      .returning({ postId: schema.postClassification.postId });
    if (!updated) throw new Error("CLASSIFICATION_STATE_CONFLICT");
  });
}

export async function failPostClassificationAttempt(
  db: DatabaseClient,
  input: {
    attemptId: string;
    postId: string;
    errorCode: string;
    modelReturned: string | null;
    responseSnapshot: unknown | null;
  },
): Promise<void> {
  const now = new Date();
  const errorCode = input.errorCode.slice(0, 120);
  await db.transaction(async (tx) => {
    const [attempt] = await tx
      .update(schema.postClassificationAttempt)
      .set({
        modelReturned: input.modelReturned,
        responseSnapshot: input.responseSnapshot,
        status: "FAILED",
        errorCode,
        completedAt: now,
      })
      .where(
        and(
          eq(schema.postClassificationAttempt.id, input.attemptId),
          eq(schema.postClassificationAttempt.postId, input.postId),
          eq(schema.postClassificationAttempt.status, "PROCESSING"),
        ),
      )
      .returning({ id: schema.postClassificationAttempt.id });
    if (!attempt) throw new Error("CLASSIFICATION_ATTEMPT_STATE_CONFLICT");

    const [updated] = await tx
      .update(schema.postClassification)
      .set({
        status: "FAILED",
        errorMessage: errorCode,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.postClassification.postId, input.postId),
          eq(schema.postClassification.status, "PROCESSING"),
        ),
      )
      .returning({ postId: schema.postClassification.postId });
    if (!updated) throw new Error("CLASSIFICATION_STATE_CONFLICT");
  });
}

export async function failStaleClassifications(
  db: DatabaseClient,
  staleAfterMs = 60 * 60 * 1000,
): Promise<number> {
  if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1) {
    throw new RangeError("staleAfterMs must be a positive integer");
  }
  const cutoff = new Date(Date.now() - staleAfterMs);
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx
      .update(schema.postClassificationAttempt)
      .set({
        status: "FAILED",
        errorCode: "PROCESSING_STALE",
        completedAt: now,
      })
      .where(
        and(
          eq(schema.postClassificationAttempt.status, "PROCESSING"),
          lt(schema.postClassificationAttempt.startedAt, cutoff),
        ),
      );

    const updated = await tx
      .update(schema.postClassification)
      .set({
        status: "FAILED",
        errorMessage: "PROCESSING_STALE",
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.postClassification.status, "PROCESSING"),
          lt(schema.postClassification.updatedAt, cutoff),
        ),
      )
      .returning({ postId: schema.postClassification.postId });
    return updated.length;
  });
}

function toXPost(post: typeof schema.xPost.$inferSelect): XPost {
  return {
    id: post.id,
    url: post.url,
    text: post.text,
    lang: post.lang,
    authorId: post.authorId,
    username: post.username,
    authorName: post.authorName,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    images: post.mediaJson,
    quotedPostId: post.quotedPostId,
    quotedText: post.quotedText,
  };
}

function parsePostDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type EncryptedXAuthSession = Pick<
  typeof schema.xAuthSession.$inferInsert,
  "accountKey" | "username" | "encryptionVersion" | "nonce" | "ciphertext" | "authTag"
>;

export async function getXAuthSession(db: Database, accountKey: string) {
  const [row] = await db
    .select()
    .from(schema.xAuthSession)
    .where(eq(schema.xAuthSession.accountKey, accountKey))
    .limit(1);
  return row;
}

export async function upsertXAuthSession(
  db: Database,
  session: EncryptedXAuthSession,
): Promise<void> {
  await db
    .insert(schema.xAuthSession)
    .values(session)
    .onConflictDoUpdate({
      target: schema.xAuthSession.accountKey,
      set: {
        username: session.username,
        encryptionVersion: session.encryptionVersion,
        nonce: session.nonce,
        ciphertext: session.ciphertext,
        authTag: session.authTag,
        updatedAt: new Date(),
      },
    });
}
