import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { RetryMessageButton } from "./retry-message-button";
import { DispatchDueButton } from "./dispatch-due-button";

interface CommunicationMessage {
  id: string;
  channel: "WHATSAPP" | "SMS";
  purpose: "TRANSACTIONAL" | "PROMOTIONAL";
  status: string;
  toAddress: string;
  body: string;
  failureReason: string | null;
  createdAt: string;
  scheduledFor: string | null;
  customer: { name: string } | null;
}

const STATUS_OPTIONS = ["QUEUED", "SCHEDULED", "SENDING", "SENT", "DELIVERED", "FAILED", "CANCELLED", "SKIPPED"];

export default async function CommunicationMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { channel, status } = params;

  const query = new URLSearchParams();
  if (channel) query.set("channel", channel);
  if (status) query.set("status", status);
  const qs = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/v1/communications/messages${qs}`);
  const messages: CommunicationMessage[] = res.ok ? await res.json() : [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Communication history</h1>
        <Link href="/communications" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Back to templates
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Every WhatsApp/SMS send attempt — transactional and promotional, immediate and scheduled, delivered and
        failed. A FAILED message can be retried once the underlying problem (e.g. provider credentials) is fixed.
      </p>

      <div className="mt-4 flex items-center justify-between">
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div>
            <label className="block text-xs font-medium text-slate-600">Channel</label>
            <select name="channel" defaultValue={channel ?? ""} className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm">
              <option value="">All</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Status</label>
            <select name="status" defaultValue={status ?? ""} className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm">
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Apply filters
          </button>
        </form>
        <DispatchDueButton />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">When</th>
            <th className="px-4 py-2">Customer</th>
            <th className="px-4 py-2">Channel</th>
            <th className="px-4 py-2">Purpose</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Body</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {messages.map((message) => (
            <tr key={message.id} className="border-t border-slate-100">
              <td className="px-4 py-2 text-slate-500">
                {message.scheduledFor
                  ? `Scheduled for ${new Date(message.scheduledFor).toLocaleString()}`
                  : new Date(message.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-slate-900">{message.customer?.name ?? message.toAddress}</td>
              <td className="px-4 py-2 text-slate-500">{message.channel}</td>
              <td className="px-4 py-2 text-slate-500">{message.purpose}</td>
              <td className="px-4 py-2">
                <span
                  className={
                    message.status === "FAILED" || message.status === "SKIPPED"
                      ? "text-red-600"
                      : message.status === "DELIVERED" || message.status === "SENT"
                        ? "text-green-700"
                        : "text-slate-500"
                  }
                >
                  {message.status}
                </span>
                {message.failureReason ? <div className="text-xs text-slate-400">{message.failureReason}</div> : null}
              </td>
              <td className="max-w-xs truncate px-4 py-2 text-slate-500" title={message.body}>
                {message.body}
              </td>
              <td className="px-4 py-2 text-right">
                {message.status === "FAILED" ? <RetryMessageButton messageId={message.id} /> : null}
              </td>
            </tr>
          ))}
          {messages.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                No messages match this filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
