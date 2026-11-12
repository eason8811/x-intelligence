import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type {
  FeedObservation,
  PostClassification,
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
): Promise<XPost[]> {
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
      .returning({ postId: schema.postClassification.postId });
    const claimedIds = claimed.map(({ postId }) => postId);
    if (claimedIds.length === 0) return [];

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
      .map(toXPost);
  });
}

export async function completePostClassification(
  db: DatabaseClient,
  postId: string,
  classification: PostClassification,
): Promise<void> {
  const [updated] = await db
    .update(schema.postClassification)
    .set({
      topic: classification.topic,
      tags: classification.tags,
      relevanceScore: classification.relevanceScore,
      classifier: classification.classifier,
      classifierVersion: classification.classifierVersion,
      status: "CLASSIFIED",
      errorMessage: null,
      classifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.postClassification.postId, postId),
        eq(schema.postClassification.status, "PROCESSING"),
      ),
    )
    .returning({ postId: schema.postClassification.postId });
  if (!updated) throw new Error("CLASSIFICATION_STATE_CONFLICT");
}

export async function failPostClassification(
  db: DatabaseClient,
  postId: string,
  errorCode: string,
): Promise<void> {
  const [updated] = await db
    .update(schema.postClassification)
    .set({
      status: "FAILED",
      errorMessage: errorCode.slice(0, 120),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.postClassification.postId, postId),
        eq(schema.postClassification.status, "PROCESSING"),
      ),
    )
    .returning({ postId: schema.postClassification.postId });
  if (!updated) throw new Error("CLASSIFICATION_STATE_CONFLICT");
}

export async function failStaleClassifications(
  db: DatabaseClient,
  staleAfterMs = 60 * 60 * 1000,
): Promise<number> {
  if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1) {
    throw new RangeError("staleAfterMs must be a positive integer");
  }
  const cutoff = new Date(Date.now() - staleAfterMs);
  const updated = await db
    .update(schema.postClassification)
    .set({
      status: "FAILED",
      errorMessage: "PROCESSING_STALE",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.postClassification.status, "PROCESSING"),
        lt(schema.postClassification.updatedAt, cutoff),
      ),
    )
    .returning({ postId: schema.postClassification.postId });
  return updated.length;
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
