import { apiFetch } from "@/lib/api";
import { RevokeSessionButton } from "./revoke-session-button";

interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
  createdByIp: string | null;
}

export default async function SessionsPage() {
  const res = await apiFetch("/v1/auth/sessions");
  const sessions: Session[] = res.ok ? await res.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Sessions</h1>
      <p className="mt-2 text-sm text-ink-2">
        Every device or browser currently signed in to your account. There&apos;s no way to tell which row is
        this browser&apos;s own session — revoking one signs that device out immediately, including this one if
        you pick it.
      </p>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Signed in</th>
            <th className="px-4 py-2">Expires</th>
            <th className="px-4 py-2">IP address</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">{new Date(session.createdAt).toLocaleString()}</td>
              <td className="px-4 py-2 text-ink-2">{new Date(session.expiresAt).toLocaleString()}</td>
              <td className="px-4 py-2 text-ink-2">{session.createdByIp ?? "—"}</td>
              <td className="px-4 py-2 text-right">
                <RevokeSessionButton sessionId={session.id} />
              </td>
            </tr>
          ))}
          {sessions.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-ink-3">
                No active sessions.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
