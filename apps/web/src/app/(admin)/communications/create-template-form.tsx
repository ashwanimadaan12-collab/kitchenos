"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

export function CreateTemplateForm({ brands }: { brands: { id: string; name: string }[] }) {
  const router = useRouter();
  const [brandId, setBrandId] = useState("");
  const [channel, setChannel] = useState<"WHATSAPP" | "SMS">("WHATSAPP");
  const [purpose, setPurpose] = useState<"TRANSACTIONAL" | "PROMOTIONAL">("TRANSACTIONAL");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [providerTemplateName, setProviderTemplateName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key || !name || !body) {
      setError("Enter a key, name and body.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/communication-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brandId || undefined,
          channel,
          purpose,
          key,
          name,
          body,
          providerTemplateName: providerTemplateName || undefined,
        }),
      });
      if (!res.ok) {
        const resBody = (await res.json().catch(() => ({ message: "Could not create template." }))) as {
          message?: string;
        };
        setError(resBody.message ?? "Could not create template.");
        return;
      }
      setKey("");
      setName("");
      setBody("");
      setProviderTemplateName("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          aria-label="Brand"
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
          placeholder="All brands (organization-wide)"
        />
        <Select
          aria-label="Channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as "WHATSAPP" | "SMS")}
          options={[
            { value: "WHATSAPP", label: "WhatsApp" },
            { value: "SMS", label: "SMS" },
          ]}
        />
        <Select
          aria-label="Purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as "TRANSACTIONAL" | "PROMOTIONAL")}
          options={[
            { value: "TRANSACTIONAL", label: "Transactional" },
            { value: "PROMOTIONAL", label: "Promotional" },
          ]}
        />
        <div>
          <label className="block text-xs font-medium text-slate-600">Key</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="mt-1 w-48 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="order_confirmation"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-48 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="Order confirmation"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Provider template name</label>
          <input
            value={providerTemplateName}
            onChange={(e) => setProviderTemplateName(e.target.value)}
            className="mt-1 w-48 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="required for WhatsApp"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">
          Body — use <code className="rounded bg-slate-100 px-1">{"{{variable}}"}</code> placeholders
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Thanks for ordering from {{brand}} at {{outlet}}! Order #{{orderNumber}}: {{items}}. Total: ₹{{total}} ({{paymentStatus}}). Loyalty points: {{loyaltyPoints}}."
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={isLoading}>
          Add template
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </form>
  );
}
