"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

const CAMPAIGN_TYPE_OPTIONS = [
  { value: "MONDAY_SPECIAL", label: "Monday special" },
  { value: "WEEKEND_COMBO", label: "Weekend combo" },
  { value: "BIRTHDAY_PROMOTION", label: "Birthday promotion" },
  { value: "WIN_BACK", label: "Win-back" },
  { value: "NEW_PRODUCT_LAUNCH", label: "New product launch" },
  { value: "LOYALTY_MILESTONE", label: "Loyalty milestone" },
  { value: "CUSTOM", label: "Custom" },
];

interface Variant {
  name: string;
  templateId: string;
  trafficPercent: string;
  isControl: boolean;
}

interface CreateCampaignFormProps {
  segments: { id: string; name: string }[];
  templates: { id: string; name: string }[];
}

export function CreateCampaignForm({ segments, templates }: CreateCampaignFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("CUSTOM");
  const [segmentId, setSegmentId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [conversionWindowDays, setConversionWindowDays] = useState("7");
  const [variants, setVariants] = useState<Variant[]>([{ name: "A", templateId: "", trafficPercent: "100", isControl: false }]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function updateVariant(index: number, patch: Partial<Variant>) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    const nextLetter = String.fromCharCode(65 + variants.length);
    setVariants((prev) => [...prev, { name: nextLetter, templateId: "", trafficPercent: "0", isControl: false }]);
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !segmentId) {
      setError("Enter a name and choose a segment.");
      return;
    }
    if (variants.some((v) => !v.isControl && !v.templateId)) {
      setError("Every non-control variant needs a WhatsApp promotional template.");
      return;
    }
    if (variants.filter((v) => v.isControl).length > 1) {
      setError("At most one variant can be a control group.");
      return;
    }
    const trafficSum = variants.reduce((sum, v) => sum + Number(v.trafficPercent || 0), 0);
    if (trafficSum !== 100) {
      setError(`Variant traffic must sum to 100% (currently ${trafficSum}%).`);
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          segmentId,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
          budgetAmount: budgetAmount || undefined,
          conversionWindowDays: Number(conversionWindowDays),
          variants: variants.map((v) => ({
            name: v.name,
            templateId: v.isControl ? undefined : v.templateId,
            trafficPercent: Number(v.trafficPercent),
            isControl: v.isControl,
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create campaign." }))) as { message?: string };
        setError(body.message ?? "Could not create campaign.");
        return;
      }
      setName("");
      setScheduledFor("");
      setBudgetAmount("");
      setVariants([{ name: "A", templateId: "", trafficPercent: "100", isControl: false }]);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-2">Campaign name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-56 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="Weekend Combo Blast"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Type</label>
          <Select
            aria-label="Campaign type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={CAMPAIGN_TYPE_OPTIONS}
            className="mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Segment</label>
          <Select
            aria-label="Segment"
            value={segmentId}
            onChange={(e) => setSegmentId(e.target.value)}
            options={segments.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Choose a segment"
            className="mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Schedule for (optional)</label>
          <input
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            type="datetime-local"
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Budget (₹, optional)</label>
          <input
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            className="mt-1 w-28 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="No cap"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Conversion window (days)</label>
          <input
            value={conversionWindowDays}
            onChange={(e) => setConversionWindowDays(e.target.value)}
            type="number"
            className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-2">
          Variants — an A/B test if more than one, traffic must sum to 100%. A control-group variant sends no
          message at all, so its lift over the real sends can be measured (Prompt 19).
        </label>
        <div className="mt-1 space-y-2">
          {variants.map((variant, index) => (
            <div key={index} className="flex items-end gap-2">
              <input
                value={variant.name}
                onChange={(e) => updateVariant(index, { name: e.target.value })}
                className="w-16 rounded-md border border-line px-2 py-1.5 text-sm"
                placeholder="A"
              />
              {variant.isControl ? (
                <div className="flex w-64 items-center rounded-md border border-dashed border-line-strong px-2 py-1.5 text-sm text-ink-3">
                  Control group — no message sent
                </div>
              ) : (
                <Select
                  aria-label={`Variant ${variant.name} template`}
                  value={variant.templateId}
                  onChange={(e) => updateVariant(index, { templateId: e.target.value })}
                  options={templates.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="WhatsApp promotional template"
                  className="w-64"
                />
              )}
              <input
                value={variant.trafficPercent}
                onChange={(e) => updateVariant(index, { trafficPercent: e.target.value })}
                type="number"
                className="w-24 rounded-md border border-line px-2 py-1.5 text-sm"
                placeholder="%"
              />
              <label className="flex items-center gap-1 whitespace-nowrap text-xs text-ink-2">
                <input
                  type="checkbox"
                  checked={variant.isControl}
                  onChange={(e) => updateVariant(index, { isControl: e.target.checked, templateId: "" })}
                />
                Control
              </label>
              {variants.length > 1 ? (
                <Button type="button" variant="ghost" onClick={() => removeVariant(index)}>
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" className="mt-2" onClick={addVariant} disabled={variants.length >= 5}>
          Add A/B variant
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={isLoading}>
          Create campaign
        </Button>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </div>
    </form>
  );
}
