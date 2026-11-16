import type { ReactNode } from "react";
import { cn } from "cn";
import { HydrationSafeEffect } from "@/components/hydration-safe-effect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Signup2Props {
  heading: string;
  description: ReactNode;
  footer: ReactNode;
  className?: string;
  children: ReactNode;
}

// Adapted from @shadcnblocks/signup2: retain its centered, single-card layout
// while rendering the application's Better Auth form and local brand.
export function Signup2({
  heading,
  description,
  footer,
  className,
  children,
}: Signup2Props) {
  return (
    <section className={cn("min-h-svh bg-muted px-4 py-12", className)}>
      <div className="mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-md flex-col items-center justify-center gap-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          X Intelligence / Workspace
        </p>
        <HydrationSafeEffect
          asChild
          inView
          fade
          slide={{ direction: "up", offset: 10 }}
          blur={{ initialBlur: 2 }}
        >
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-2xl">{heading}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
        </HydrationSafeEffect>
        <div className="text-center text-sm text-muted-foreground">{footer}</div>
      </div>
    </section>
  );
}
