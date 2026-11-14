"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Effect } from "@animate-ui/react/primitives/effects/effect";

export function FeedPostReveal({ children }: { children: ReactElement }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [revealOnScroll, setRevealOnScroll] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { top, bottom } = container.getBoundingClientRect();
    const isInitiallyVisible = top < window.innerHeight && bottom > 0;
    setRevealOnScroll(!isInitiallyVisible);
  }, []);

  return (
    <div ref={containerRef}>
      {revealOnScroll ? (
        <Effect
          asChild
          inView
          fade
          slide={{ direction: "up", offset: 12 }}
          blur={{ initialBlur: 2 }}
        >
          {children}
        </Effect>
      ) : (
        children
      )}
    </div>
  );
}
