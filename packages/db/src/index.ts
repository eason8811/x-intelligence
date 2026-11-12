import { eq, sql } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { FeedObservation } from "@x-intelligence/shared";
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
