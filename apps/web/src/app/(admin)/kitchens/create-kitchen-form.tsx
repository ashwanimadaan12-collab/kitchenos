"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

const KIND_OPTIONS = [
  { value: "PRODUCTION", label: "Production kitchen" },
  { value: "CENTRAL_WAREHOUSE", label: "Central warehouse" },
];

export function CreateKitchenForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("PRODUCTION");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/kitchens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, kind }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create kitchen." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create kitchen.");
        return;
      }
      setName("");
      setCode("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="kitchen-name">
          Name
        </label>
        <input
          id="kitchen-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="Old Monk Kitchen"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="kitchen-code">
          Code
        </label>
        <input
          id="kitchen-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="KOM-01"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="kitchen-kind">
          Kind
        </label>
        <Select
          id="kitchen-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={KIND_OPTIONS}
          className="mt-1"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add kitchen
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
