import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
  primaryKey,
  index,
  uniqueIndex,
  doublePrecision,
  check,
} from "drizzle-orm/pg-core";
import { TOPICS, type XPost } from "@x-intelligence/shared";
export const topicEnum = pgEnum("topic", TOPICS);
export const runStatusEnum = pgEnum("feed_run_status", [
  "RUNNING",
  "SUCCESS",
  "PARTIAL",
  "FAILED",
]);
export const classificationStatusEnum = pgEnum("classification_status", [
  "PENDING",
  "PROCESSING",
  "CLASSIFIED",
  "FAILED",
]);
export const classificationAttemptStatusEnum = pgEnum(
  "classification_attempt_status",
  ["PROCESSING", "SUCCEEDED", "FAILED"],
);
const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
export const xPost = pgTable("x_post", {
  id: text("id").primaryKey(),
  authorId: text("author_id"),
  username: text("username"),
  authorName: text("author_name"),
  text: text("text").notNull(),
  lang: text("lang"),
  publishedAt: time("published_at"),
  url: text("url").notNull(),
  quotedPostId: text("quoted_post_id"),
  quotedText: text("quoted_text"),
  mediaJson: jsonb("media_json").$type<XPost["images"]>().notNull().default([]),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const feedRun = pgTable(
  "feed_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startedAt: time("started_at").notNull().defaultNow(),
    finishedAt: time("finished_at"),
    status: runStatusEnum("status").notNull().default("RUNNING"),
    targetCount: integer("target_count").notNull(),
    collectedCount: integer("collected_count").notNull().default(0),
    scrollCount: integer("scroll_count").notNull().default(0),
    errorMessage: text("error_message"),
  },
  (t) => [
    check(
      "feed_run_counts_nonnegative",
      sql`${t.targetCount} > 0 AND ${t.collectedCount} >= 0 AND ${t.scrollCount} >= 0`,
    ),
  ],
);
export const feedObservation = pgTable(
  "feed_observation",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => feedRun.id),
    postId: text("post_id")
      .notNull()
      .references(() => xPost.id),
    position: integer("position").notNull(),
    observedAt: time("observed_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.postId] }),
    index("feed_observation_post_idx").on(t.postId),
    check("feed_observation_position_positive", sql`${t.position} > 0`),
  ],
);
export const postClassification = pgTable(
  "post_classification",
  {
    postId: text("post_id")
      .primaryKey()
      .references(() => xPost.id),
    topic: topicEnum("topic"),
    tags: text("tags").array().notNull().default([]),
    relevanceScore: doublePrecision("relevance_score"),
    classifier: text("classifier"),
    classifierVersion: text("classifier_version"),
    status: classificationStatusEnum("status").notNull().default("PENDING"),
    retryCount: integer("retry_count").notNull().default(0),
    errorMessage: text("error_message"),
    classifiedAt: time("classified_at"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("post_classification_status_idx").on(t.status),
    check(
      "classification_relevance_range",
      sql`${t.relevanceScore} >= 0 AND ${t.relevanceScore} <= 1`,
    ),
    check("classification_retry_nonnegative", sql`${t.retryCount} >= 0`),
    check(
      "classified_result_required",
      sql`${t.status} <> 'CLASSIFIED' OR (${t.topic} IS NOT NULL AND ${t.relevanceScore} IS NOT NULL AND ${t.classifier} IS NOT NULL AND ${t.classifierVersion} IS NOT NULL AND ${t.classifiedAt} IS NOT NULL)`,
    ),
  ],
);
export const postClassificationAttempt = pgTable(
  "post_classification_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: text("post_id")
      .notNull()
      .references(() => xPost.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    provider: text("provider").notNull(),
    classifier: text("classifier").notNull(),
    modelRequested: text("model_requested").notNull(),
    modelReturned: text("model_returned"),
    requestSnapshot: jsonb("request_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    responseSnapshot: jsonb("response_snapshot").$type<unknown>(),
    status: classificationAttemptStatusEnum("status")
      .notNull()
      .default("PROCESSING"),
    errorCode: text("error_code"),
    startedAt: time("started_at").notNull().defaultNow(),
    completedAt: time("completed_at"),
  },
  (t) => [
    uniqueIndex("post_classification_attempt_post_attempt_unique_idx").on(
      t.postId,
      t.attemptNumber,
    ),
    index("post_classification_attempt_status_started_idx").on(
      t.status,
      t.startedAt,
    ),
    check(
      "classification_attempt_number_positive",
      sql`${t.attemptNumber} > 0`,
    ),
    check(
      "classification_attempt_terminal_fields",
      sql`(${t.status} = 'PROCESSING' AND ${t.completedAt} IS NULL AND ${t.errorCode} IS NULL) OR (${t.status} = 'SUCCEEDED' AND ${t.completedAt} IS NOT NULL AND ${t.responseSnapshot} IS NOT NULL AND ${t.modelReturned} IS NOT NULL AND ${t.errorCode} IS NULL) OR (${t.status} = 'FAILED' AND ${t.completedAt} IS NOT NULL AND ${t.errorCode} IS NOT NULL)`,
    ),
  ],
);

// The browser session contains account credentials. Only AES-GCM ciphertext,
// nonce and authentication tag are stored in PostgreSQL.
export const xAuthSession = pgTable("x_auth_session", {
  accountKey: text("account_key").primaryKey(),
  username: text("username").notNull(),
  encryptionVersion: integer("encryption_version").notNull(),
  nonce: text("nonce").notNull(),
  ciphertext: text("ciphertext").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
