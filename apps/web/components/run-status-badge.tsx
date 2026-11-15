import type { FeedRunStatus } from "@x-intelligence/shared";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<FeedRunStatus, string> = {
  RUNNING: "进行中",
  SUCCESS: "已完成",
  PARTIAL: "部分完成",
  FAILED: "失败",
};

const VARIANTS: Record<FeedRunStatus, "default" | "secondary" | "destructive"> = {
  RUNNING: "secondary",
  SUCCESS: "default",
  PARTIAL: "secondary",
  FAILED: "destructive",
};

export function RunStatusBadge({ status }: { status: FeedRunStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
