import Link from "next/link";
import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Welcome back{session ? `, ${session.firstName}` : ""}</h1>
      <p className="mt-2 text-sm text-slate-600">Restaurant naya hai? 2 minute me set up karo.</p>

      <Link
        href="/quick-setup"
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
      >
        🚀 Quick Setup shuru karo
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {session?.memberships.map((m) => (
          <div key={m.organizationId} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Organization</p>
            <p className="mt-1 font-medium text-slate-900">{m.organizationName}</p>
            <p className="mt-1 text-xs text-slate-500">Role: {m.roleName}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
