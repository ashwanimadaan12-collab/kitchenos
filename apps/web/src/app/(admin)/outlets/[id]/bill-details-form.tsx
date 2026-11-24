"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gstinState, isValidGstin, normalizeGstin } from "@kitchenos/shared";
import { Button, Field, Input } from "@kitchenos/ui";

interface BillDetailsFormProps {
  outletId: string;
  gstin: string | null;
  fssaiLicence: string | null;
  address: string | null;
  city: string | null;
}

/**
 * What this outlet prints at the top of a bill.
 *
 * Kept on its own form rather than inside the outlet's other settings: these
 * are the fields that decide whether the paper is a tax invoice or a plain
 * receipt, and getting one character wrong is a compliance problem rather than
 * a cosmetic one.
 */
export function BillDetailsForm({ outletId, gstin, fssaiLicence, address, city }: BillDetailsFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    gstin: gstin ?? "",
    fssaiLicence: fssaiLicence ?? "",
    address: address ?? "",
    city: city ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/outlets/${outletId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // A cleared box sends null, which the API treats as "remove this",
        // rather than "" (rejected by the format check) or an omitted key
        // (which would silently leave the old value in place).
        body: JSON.stringify({
          gstin: form.gstin.trim() ? form.gstin.trim().toUpperCase() : null,
          fssaiLicence: form.fssaiLicence.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Save nahi hua." }))) as {
          message?: string | string[];
        };
        const msg = Array.isArray(body.message) ? body.message.join(" · ") : body.message;
        setError(msg ?? "Save nahi hua. Dobara koshish karo.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  const typedGstin = normalizeGstin(form.gstin);
  const gstinLooksRight = typedGstin.length === 0 || isValidGstin(typedGstin);
  const state = gstinLooksRight && typedGstin ? gstinState(typedGstin) : null;
  const willPrintTaxInvoice = typedGstin.length > 0 && gstinLooksRight;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          htmlFor="outlet-gstin"
          label="GSTIN"
          hint={
            state
              ? `${state} ka registration`
              : "15 character. Khaali chhodo to bill 'RECEIPT' chhapega, 'TAX INVOICE' nahi."
          }
          error={typedGstin.length > 0 && !gstinLooksRight ? "Ye GSTIN sahi nahi hai — check karo" : undefined}
        >
          <Input
            id="outlet-gstin"
            value={form.gstin}
            onChange={(e) => set("gstin", e.target.value)}
            placeholder="09AAACS1234F1ZQ"
            className="uppercase"
          />
        </Field>

        <Field htmlFor="outlet-fssai" label="FSSAI licence" hint="14 ank">
          <Input
            id="outlet-fssai"
            value={form.fssaiLicence}
            onChange={(e) => set("fssaiLicence", e.target.value)}
            placeholder="12345678901234"
            inputMode="numeric"
          />
        </Field>

        <Field htmlFor="outlet-address" label="Address" hint="Bill ke upar chhapega">
          <Input
            id="outlet-address"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Shop 14, Atta Market"
          />
        </Field>

        <Field htmlFor="outlet-city" label="City">
          <Input
            id="outlet-city"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="Noida"
          />
        </Field>
      </div>

      <p className="text-sm text-ink-2">
        Bill ke upar chhapega:{" "}
        <strong className={willPrintTaxInvoice ? "text-good" : "text-warn"}>
          {willPrintTaxInvoice ? "TAX INVOICE" : "RECEIPT"}
        </strong>
        {willPrintTaxInvoice ? " — CGST/SGST ka rate-wise breakup bhi aayega." : " — GSTIN bina tax invoice nahi chhap sakta."}
      </p>

      {error ? (
        <p className="rounded-control bg-bad-tint px-4 py-3 text-sm font-semibold text-bad" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={isLoading} className="self-start">
          Save karo
        </Button>
        {saved && !error ? (
          <span className="text-sm font-bold text-good" role="status">
            Save ho gaya
          </span>
        ) : null}
        <a
          href="/print/test"
          target="_blank"
          rel="noopener"
          className="text-sm font-bold text-brand hover:underline"
        >
          Test bill print karke dekho
        </a>
      </div>
    </form>
  );
}
