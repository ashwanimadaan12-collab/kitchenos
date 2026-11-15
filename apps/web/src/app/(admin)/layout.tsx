import { redirect } from "next/navigation";
import { getSession, getActiveOrganizationId } from "@/lib/session";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const activeOrgId = (await getActiveOrganizationId()) ?? session.memberships[0]?.organizationId ?? null;

  return (
    <AdminShell session={session} activeOrgId={activeOrgId}>
      {children}
    </AdminShell>
  );
}
