import { Sidebar1 } from "@/components/sidebar1";
import { requireCurrentUser } from "@/lib/auth-session";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireCurrentUser();
  return <Sidebar1 userEmail={user.email}>{children}</Sidebar1>;
}
