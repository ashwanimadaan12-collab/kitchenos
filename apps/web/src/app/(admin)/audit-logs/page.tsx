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
      <h1 className="text-2xl font-semibold text-ink">Audit Logs</h1>
      <p className="mt-2 text-sm text-ink-2">
        A record of every create/update action taken in this organization, most recent first. Login/logout
        events aren&apos;t shown here since they happen before an organization is selected.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
        <div>
          <label className="block text-xs font-medium text-ink-2">Entity type</label>
          <input
            name="entityType"
            defaultValue={entityType ?? ""}
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="e.g. Order"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Action</label>
          <input
            name="action"
            defaultValue={action ?? ""}
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="e.g. order.create"
          />
        </div>
        <button type="submit" className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover">
          Apply filters
        </button>
      </form>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
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
            <tr key={entry.id} className="border-t border-line">
              <td className="px-4 py-2 text-ink-2">{new Date(entry.createdAt).toLocaleString()}</td>
              <td className="px-4 py-2 font-medium text-ink">{entry.action}</td>
              <td className="px-4 py-2 text-ink-2">
                {entry.entityType}
                {entry.entityId ? <span className="text-xs text-ink-3"> ({entry.entityId.slice(0, 8)}…)</span> : null}
              </td>
              <td className="px-4 py-2 text-ink-2">
                {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : "—"}
              </td>
              <td className="px-4 py-2 text-ink-2">{entry.ipAddress ?? "—"}</td>
            </tr>
          ))}
          {entries.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                No audit log entries match this filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
