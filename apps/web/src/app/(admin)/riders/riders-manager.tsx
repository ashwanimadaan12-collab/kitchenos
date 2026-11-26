"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Field, Input, Select } from "@kitchenos/ui";

export interface Rider {
  id: string;
  outletId: string;
  name: string;
  phone: string | null;
  isActive: boolean;
}

export interface RiderOutlet {
  id: string;
  name: string;
}

export function RidersManager({ riders, outlets }: { riders: Rider[]; outlets: RiderOutlet[] }) {
  const router = useRouter();
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(payload.message ?? "Save nahi hua.");
    }
  }

  async function add() {
    if (!name.trim()) {
      setError("Naam daalo.");
      return;
    }
    if (!outletId) {
      setError("Pehle outlet banao.");
      return;
    }
    setError(null);
    setBusy("add");
    try {
      await send("/api/catalog/riders", "POST", {
        outletId,
        name: name.trim(),
        // Empty means "no number", which the API spells as null. An empty string would
        // fail the 10-digit check instead of clearing the field.
        phone: phone.trim() === "" ? null : phone.trim(),
      });
      setName("");
      setPhone("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save nahi hua.");
    } finally {
      setBusy(null);
    }
  }

  async function toggle(rider: Rider) {
    setError(null);
    setBusy(rider.id);
    try {
      await send(`/api/catalog/riders/${rider.id}`, "PATCH", {
        isActive: !rider.isActive,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save nahi hua.");
    } finally {
      setBusy(null);
    }
  }

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        {outlets.length > 1 ? (
          <Field label="Outlet" htmlFor="rider-outlet">
            <Select
              id="rider-outlet"
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            />
          </Field>
        ) : null}
        <Field label="Naam" htmlFor="rider-name">
          <Input id="rider-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ramesh" />
        </Field>
        <Field label="Phone (optional)" htmlFor="rider-phone">
          <Input
            id="rider-phone"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            placeholder="9876543210"
          />
        </Field>
        <Button onClick={add} isLoading={busy === "add"}>
          Add karo
        </Button>
      </div>

      {error ? <p className="text-sm font-medium text-bad">{error}</p> : null}

      {riders.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-ink-3">
          Abhi koi delivery boy add nahi hai.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {riders.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{r.name}</p>
                <p className="truncate text-xs text-ink-2">
                  {r.phone ?? "number nahi"} · {outletName(r.outletId)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={r.isActive ? "good" : "neutral"}>{r.isActive ? "Chalu" : "Band"}</Badge>
                <Button variant="ghost" size="sm" isLoading={busy === r.id} onClick={() => toggle(r)}>
                  {r.isActive ? "Band karo" : "Chalu karo"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
