import { eq } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
export * from "./schema";
// Lazy connection: builds do not require credentials. Caller owns pool cleanup.
export function createDatabase(connectionString: string) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

type Database = ReturnType<typeof createDatabase>["db"];
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
