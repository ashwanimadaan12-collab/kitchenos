"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface Preference {
  channel: "WHATSAPP" | "SMS";
  transactionalOptIn: boolean;
  marketingOptIn: boolean;
  consentSource: string | null;
  consentGivenAt: string | null;
  optedOutAt: string | null;
}

const CHANNELS: Preference["channel"][] = ["WHATSAPP", "SMS"];

export function CommunicationPreferencesPanel({ customerId, preferences }: { customerId: string; preferences: Preference[] }) {
  const router = useRouter();
  const [source, setSource] = useState("pos_checkout");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const byChannel = new Map(preferences.map((p) => [p.channel, p]));

  async function recordConsent(channel: Preference["channel"]) {
    setLoadingKey(`consent-${channel}`);
    try {
      await fetch(`/api/catalog/customers/${customerId}/communication-preferences/${channel}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      router.refresh();
    } finally {
      setLoadingKey(null);
    }
  }

  async function optOut(channel: Preference["channel"], scope: "ALL" | "MARKETING") {
    setLoadingKey(`optout-${channel}-${scope}`);
    try {
      await fetch(`/api/catalog/customers/${customerId}/communication-preferences/${channel}/opt-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      router.refresh();
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Communication preferences</h2>
      <p className="mt-1 text-xs text-slate-500">
        Transactional messages (order confirmations, status updates) are allowed by default. Marketing messages
        require explicit, recorded consent before anything is sent.
      </p>

      <div className="mt-3 flex items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">Consent source</label>
          <Select
            aria-label="Consent source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            options={[
              { value: "pos_checkout", label: "POS checkout" },
              { value: "phone_call", label: "Phone call" },
              { value: "signup_form", label: "Signup form" },
            ]}
          />
        </div>
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Channel</th>
            <th className="px-4 py-2">Transactional</th>
            <th className="px-4 py-2">Marketing</th>
            <th className="px-4 py-2">Consent evidence</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {CHANNELS.map((channel) => {
            const pref = byChannel.get(channel);
            return (
              <tr key={channel} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{channel}</td>
                <td className="px-4 py-2 text-slate-500">
                  {(pref?.transactionalOptIn ?? true) ? "Allowed" : "Opted out of all messages"}
                </td>
                <td className="px-4 py-2 text-slate-500">{pref?.marketingOptIn ? "Opted in" : "Not consented"}</td>
                <td className="px-4 py-2 text-xs text-slate-400">
                  {pref?.consentGivenAt
                    ? `${pref.consentSource ?? "unknown source"} on ${new Date(pref.consentGivenAt).toLocaleDateString()}`
                    : "—"}
                  {pref?.optedOutAt ? ` · opted out ${new Date(pref.optedOutAt).toLocaleDateString()}` : ""}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      isLoading={loadingKey === `consent-${channel}`}
                      onClick={() => recordConsent(channel)}
                    >
                      Record consent
                    </Button>
                    <Button
                      variant="secondary"
                      isLoading={loadingKey === `optout-${channel}-MARKETING`}
                      onClick={() => optOut(channel, "MARKETING")}
                    >
                      Opt out (marketing)
                    </Button>
                    <Button
                      variant="danger"
                      isLoading={loadingKey === `optout-${channel}-ALL`}
                      onClick={() => optOut(channel, "ALL")}
                    >
                      Opt out (all)
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
