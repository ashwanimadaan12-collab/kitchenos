"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function CreateSupplierForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("3");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contactName: contactName || undefined,
          phone: phone || undefined,
          leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create supplier." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create supplier.");
        return;
      }
      setName("");
      setContactName("");
      setPhone("");
      setLeadTimeDays("3");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="supplier-name">
          Name
        </label>
        <input
          id="supplier-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="Fresh Farms Produce"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="supplier-contact">
          Contact name
        </label>
        <input
          id="supplier-contact"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="supplier-phone">
          Phone
        </label>
        <input
          id="supplier-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="supplier-lead-time">
          Lead time (days)
        </label>
        <input
          id="supplier-lead-time"
          type="number"
          value={leadTimeDays}
          onChange={(e) => setLeadTimeDays(e.target.value)}
          className="mt-1 w-20 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add supplier
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
