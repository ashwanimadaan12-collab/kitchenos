"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

export function CreateTableForm({ outlets }: { outlets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [outletId, setOutletId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!outletId || !name) {
      setError("Choose an outlet and enter a table name.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId, name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create table." }))) as { message?: string };
        setError(body.message ?? "Could not create table.");
        return;
      }
      setName("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Outlet"
        value={outletId}
        onChange={(e) => setOutletId(e.target.value)}
        options={outlets.map((o) => ({ value: o.id, label: o.name }))}
        placeholder="Select an outlet"
      />
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="table-name">
          Table name
        </label>
        <input
          id="table-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="T1"
          className="mt-1 w-28 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add table
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
