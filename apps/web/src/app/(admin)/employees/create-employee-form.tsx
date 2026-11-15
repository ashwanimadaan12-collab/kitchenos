"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

export function CreateEmployeeForm({ outlets }: { outlets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [outletId, setOutletId] = useState("");
  const [phone, setPhone] = useState("");
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !role || !hireDate) {
      setError("Enter a name, role and hire date.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          outletId: outletId || undefined,
          phone: phone || undefined,
          hireDate,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create employee." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create employee.");
        return;
      }
      setName("");
      setRole("");
      setOutletId("");
      setPhone("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Priya Sharma"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Role</label>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Cashier"
        />
      </div>
      <Select
        aria-label="Outlet"
        value={outletId}
        onChange={(e) => setOutletId(e.target.value)}
        options={outlets.map((o) => ({ value: o.id, label: o.name }))}
        placeholder="Organization-wide"
      />
      <div>
        <label className="block text-xs font-medium text-slate-600">Phone</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="optional"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Hire date</label>
        <input
          type="date"
          value={hireDate}
          onChange={(e) => setHireDate(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add employee
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
