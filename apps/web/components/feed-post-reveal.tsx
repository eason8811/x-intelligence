import type { ReactElement } from "react";
import { HydrationSafeEffect } from "@/components/hydration-safe-effect";

export function FeedPostReveal({ children }: { children: ReactElement }) {
  return (
    <div>
      <HydrationSafeEffect
        asChild
        inView
        fade
        slide={{ direction: "up", offset: 12 }}
        blur={{ initialBlur: 2 }}
      >
        {children}
      </HydrationSafeEffect>
    </div>
  );
}
