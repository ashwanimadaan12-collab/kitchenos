"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function CreateBrandForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create brand." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create brand.");
        return;
      }
      setName("");
      setSlug("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="brand-name">
          Name
        </label>
        <input
          id="brand-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Cafe Old Monk"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="brand-slug">
          Slug
        </label>
        <input
          id="brand-slug"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="cafe-old-monk"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add brand
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
