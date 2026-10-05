export const TOPICS = [
  "ai",
  "programming",
  "product",
  "startup",
  "finance",
  "gaming",
  "design",
  "science",
  "news",
  "life",
  "other",
] as const;
export type Topic = (typeof TOPICS)[number];
export type FeedRunStatus = "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
export type ClassificationStatus =
  | "PENDING"
  | "PROCESSING"
  | "CLASSIFIED"
  | "FAILED";
export interface XPost {
  id: string;
  url: string;
  text: string;
  lang: string | null;
  authorId?: string | null;
  username: string | null;
  authorName: string | null;
  publishedAt: string | null;
  images: { src: string; alt: string | null }[];
  quotedPostId?: string | null;
  quotedText: string | null;
}
export interface FeedObservation {
  post: XPost;
  position: number;
  observedAt: Date;
}
export interface PostClassification {
  topic: Topic;
  tags: string[];
  relevanceScore: number;
  classifier: string;
  classifierVersion: string;
}
