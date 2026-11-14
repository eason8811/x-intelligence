"use client";

import { Button } from "@/components/ui/button";

export function FeedPostLink({ href }: { href: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={href} target="_blank" rel="noreferrer">
        在 X 打开
        <span aria-hidden="true">↗</span>
      </a>
    </Button>
  );
}
