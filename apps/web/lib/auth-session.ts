import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export const getCurrentSession = cache(async () =>
  getAuth().api.getSession({ headers: await headers() }),
);

export const requireCurrentUser = cache(async () => {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session.user;
});
