"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { HydrationSafeEffect } from "@/components/hydration-safe-effect";
import { buttonVariants } from "@/components/ui/button";

type NavigationButtonProps = {
  href: string;
  children: ReactNode;
  className?: string;
} & Pick<VariantProps<typeof buttonVariants>, "variant" | "size">;

export function NavigationButton({
  href,
  children,
  variant,
  size,
  className,
}: NavigationButtonProps) {
  return (
    <HydrationSafeEffect
      className="inline-flex"
      inView
      fade
      slide={{ direction: "up", offset: 6 }}
      whileTap={{ scale: 0.97 }}
    >
      <Link
        href={href}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
      >
        {children}
      </Link>
    </HydrationSafeEffect>
  );
}
