"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import {
  Effect,
  Effects,
  type EffectProps,
  type EffectsProps,
} from "@animate-ui/react/primitives/effects/effect";

function subscribeToHydration() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function useHydrationReady() {
  return useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );
}

type HydrationSafeEffectProps = Omit<EffectProps, "children"> & {
  children: ReactElement;
};

type HydrationSafeEffectsProps = Omit<EffectsProps, "children"> & {
  children: ReactElement | ReactElement[];
};

export function HydrationSafeEffect({
  children,
  ...props
}: HydrationSafeEffectProps) {
  const hydrationReady = useHydrationReady();

  return hydrationReady ? <Effect {...props}>{children}</Effect> : children;
}

export function HydrationSafeEffects({
  children,
  ...props
}: HydrationSafeEffectsProps) {
  const hydrationReady = useHydrationReady();

  return hydrationReady ? <Effects {...props}>{children}</Effects> : children;
}
