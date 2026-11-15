import { apiFetch } from "@/lib/api";

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  ipAddress: string | null;
  user: { firstName: string; lastName: string; email: string } | null;
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { entityType, action } = params;

  const query = new URLSearchParams();
  if (entityType) query.set("entityType", entityType);
  if (action) query.set("action", action);
  const qs = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/v1/audit-logs${qs}`);
  const entries: AuditLogEntry[] = res.ok ? await res.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Audit Logs</h1>
      <p className="mt-2 text-sm text-slate-600">
        A record of every create/update action taken in this organization, most recent first. Login/logout
        events aren&apos;t shown here since they happen before an organization is selected.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">Entity type</label>
          <input
            name="entityType"
            defaultValue={entityType ?? ""}
            className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="e.g. Order"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Action</label>
          <input
            name="action"
            defaultValue={action ?? ""}
            className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="e.g. order.create"
          />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Apply filters
        </button>
      </form>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">When</th>
            <th className="px-4 py-2">Action</th>
            <th className="px-4 py-2">Entity</th>
            <th className="px-4 py-2">User</th>
            <th className="px-4 py-2">IP</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t border-slate-100">
              <td className="px-4 py-2 text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td>
              <td className="px-4 py-2 font-medium text-slate-900">{entry.action}</td>
              <td className="px-4 py-2 text-slate-500">
                {entry.entityType}
                {entry.entityId ? <span className="text-xs text-slate-400"> ({entry.entityId.slice(0, 8)}…)</span> : null}
              </td>
              <td className="px-4 py-2 text-slate-500">
                {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : "—"}
              </td>
              <td className="px-4 py-2 text-slate-500">{entry.ipAddress ?? "—"}</td>
            </tr>
          ))}
          {entries.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                No audit log entries match this filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
