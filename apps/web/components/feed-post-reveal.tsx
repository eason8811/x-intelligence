"use client";

import {
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { Effect } from "@animate-ui/react/primitives/effects/effect";

function subscribeToHydration() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function FeedPostReveal({ children }: { children: ReactElement }) {
  const animationReady = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );

  return (
    <div>
      {animationReady ? (
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
