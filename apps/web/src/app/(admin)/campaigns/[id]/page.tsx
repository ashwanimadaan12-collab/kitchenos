import { notFound } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CampaignActions } from "../campaign-actions";

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: "DRAFT" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "CANCELLED";
  scheduledFor: string | null;
  budgetAmount: string | null;
  costPerMessage: string;
  conversionWindowDays: number;
  segment: { name: string };
  variants: { id: string; name: string; trafficPercent: number; isControl: boolean; template: { name: string } | null }[];
}

interface Stats {
  targeted: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  converted: number;
  conversionRate: number;
  revenueAttributed: string;
  variants: {
    variantId: string;
    name: string;
    targeted: number;
    sent: number;
    delivered: number;
    failed: number;
    skipped: number;
    converted: number;
    conversionRate: number;
    revenueAttributed: string;
  }[];
  experiment: {
    controlVariantId: string;
    lift: { variantId: string; conversionRateLift: number; revenuePerRecipientLift: string }[];
  } | null;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
    </div>
  );
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaignRes, statsRes] = await Promise.all([apiFetch(`/v1/campaigns/${id}`), apiFetch(`/v1/campaigns/${id}/stats`)]);
  if (campaignRes.status === 404) notFound();
  if (!campaignRes.ok || !statsRes.ok) throw new Error("Failed to load campaign");

  const campaign: Campaign = await campaignRes.json();
  const stats: Stats = await statsRes.json();

  return (
    <div>
      <Link href="/campaigns" className="text-sm font-medium text-ink-2 hover:text-ink">
        ← Back to campaigns
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{campaign.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {campaign.type.replace(/_/g, " ")} · Segment: {campaign.segment.name} · {campaign.status}
            {campaign.budgetAmount ? ` · Budget ₹${campaign.budgetAmount} at ₹${campaign.costPerMessage}/message` : ""}
          </p>
        </div>
        <CampaignActions campaignId={campaign.id} status={campaign.status} />
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Overall performance</h2>
        <div className="mt-3 grid grid-cols-4 gap-3 lg:grid-cols-8">
          <StatTile label="Targeted" value={stats.targeted} />
          <StatTile label="Sent" value={stats.sent} />
          <StatTile label="Delivered" value={stats.delivered} />
          <StatTile label="Failed" value={stats.failed} />
          <StatTile label="Skipped" value={stats.skipped} />
          <StatTile label="Converted" value={stats.converted} />
          <StatTile label="Conv. rate" value={`${stats.conversionRate}%`} />
          <StatTile label="Revenue attributed" value={`₹${stats.revenueAttributed}`} />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">
          Variants {campaign.variants.length > 1 ? "(A/B test)" : ""}
        </h2>
        <table className="mt-3 w-full overflow-hidden rounded-lg border border-line text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">Variant</th>
              <th className="px-4 py-2">Template</th>
              <th className="px-4 py-2">Traffic</th>
              <th className="px-4 py-2">Targeted</th>
              <th className="px-4 py-2">Sent</th>
              <th className="px-4 py-2">Delivered</th>
              <th className="px-4 py-2">Failed</th>
              <th className="px-4 py-2">Skipped</th>
              <th className="px-4 py-2">Converted</th>
              <th className="px-4 py-2">Conv. rate</th>
              <th className="px-4 py-2">Revenue</th>
              {stats.experiment ? <th className="px-4 py-2">Lift vs. control</th> : null}
            </tr>
          </thead>
          <tbody>
            {campaign.variants.map((variant) => {
              const variantStats = stats.variants.find((v) => v.variantId === variant.id);
              const lift = stats.experiment?.lift.find((l) => l.variantId === variant.id);
              return (
                <tr key={variant.id} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">
                    {variant.name}
                    {variant.isControl ? <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">Control</span> : null}
                  </td>
                  <td className="px-4 py-2 text-ink-2">{variant.template ? variant.template.name : "— (control)"}</td>
                  <td className="px-4 py-2 text-ink-2">{variant.trafficPercent}%</td>
                  <td className="px-4 py-2 text-ink-2">{variantStats?.targeted ?? 0}</td>
                  <td className="px-4 py-2 text-ink-2">{variantStats?.sent ?? 0}</td>
                  <td className="px-4 py-2 text-ink-2">{variantStats?.delivered ?? 0}</td>
                  <td className="px-4 py-2 text-ink-2">{variantStats?.failed ?? 0}</td>
                  <td className="px-4 py-2 text-ink-2">{variantStats?.skipped ?? 0}</td>
                  <td className="px-4 py-2 text-ink-2">{variantStats?.converted ?? 0}</td>
                  <td className="px-4 py-2 text-ink-2">{variantStats?.conversionRate ?? 0}%</td>
                  <td className="px-4 py-2 text-ink-2">₹{variantStats?.revenueAttributed ?? "0"}</td>
                  {stats.experiment ? (
                    <td className="px-4 py-2 text-ink-2">
                      {variant.isControl ? (
                        "baseline"
                      ) : lift ? (
                        <span className={lift.conversionRateLift >= 0 ? "text-good" : "text-bad"}>
                          {lift.conversionRateLift >= 0 ? "+" : ""}
                          {lift.conversionRateLift}pp · ₹{lift.revenuePerRecipientLift}/recipient
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {stats.experiment ? (
          <p className="mt-2 text-xs text-ink-2">
            Lift is each variant&apos;s own numbers minus the control group&apos;s — the whole reason to run a
            control group instead of reading each variant&apos;s raw numbers alone.
          </p>
        ) : null}
      </section>
    </div>
  );
}
