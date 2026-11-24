import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreateSegmentForm } from "./create-segment-form";
import { CreateCampaignForm } from "./create-campaign-form";
import { CampaignActions } from "./campaign-actions";

interface Segment {
  id: string;
  name: string;
  type: string;
  inactiveDays: number | null;
  minOrders: number | null;
  brandId: string | null;
  minSpend: string | null;
  loyaltyTierId: string | null;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: "DRAFT" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "CANCELLED";
  scheduledFor: string | null;
  segment: { name: string };
  variants: { id: string; name: string }[];
}

interface Brand {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
  channel: string;
  purpose: string;
  isActive: boolean;
}

const STATUS_BADGE: Record<Campaign["status"], string> = {
  DRAFT: "bg-surface-2 text-ink-2",
  SCHEDULED: "bg-brand-tint text-brand-tint-ink",
  RUNNING: "bg-warn-tint text-warn",
  COMPLETED: "bg-good-tint text-good",
  CANCELLED: "bg-bad-tint text-bad",
};

export default async function CampaignsPage() {
  const [segmentsRes, campaignsRes, brandsRes, tiersRes, templatesRes] = await Promise.all([
    apiFetch("/v1/customer-segments"),
    apiFetch("/v1/campaigns"),
    apiFetch("/v1/brands"),
    apiFetch("/v1/loyalty/tiers"),
    apiFetch("/v1/communication-templates?channel=WHATSAPP"),
  ]);
  const segments: Segment[] = segmentsRes.ok ? await segmentsRes.json() : [];
  const campaigns: Campaign[] = campaignsRes.ok ? await campaignsRes.json() : [];
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const loyaltyTiers: { id: string; name: string }[] = tiersRes.ok ? await tiersRes.json() : [];
  const allTemplates: Template[] = templatesRes.ok ? await templatesRes.json() : [];
  const blastTemplates = allTemplates.filter((t) => t.purpose === "PROMOTIONAL" && t.isActive);

  const brandsById = new Map(brands.map((b) => [b.id, b.name]));
  const tiersById = new Map(loyaltyTiers.map((t) => [t.id, t.name]));

  function segmentDescription(segment: Segment): string {
    switch (segment.type) {
      case "ALL":
        return "Everyone";
      case "INACTIVE":
        return `Inactive ${segment.inactiveDays}+ days`;
      case "REPEAT":
        return `${segment.minOrders}+ paid orders`;
      case "BRAND_PREFERENCE":
        return `Prefers ${segment.brandId ? brandsById.get(segment.brandId) ?? "—" : "—"}`;
      case "TOTAL_SPEND":
        return `Spent ₹${segment.minSpend}+`;
      case "LOYALTY_TIER":
        return `${segment.loyaltyTierId ? tiersById.get(segment.loyaltyTierId) ?? "—" : "—"} tier`;
      case "BIRTHDAY_THIS_WEEK":
        return "Birthday this week";
      default:
        return segment.type;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">WhatsApp Marketing Automation</h1>
      <p className="mt-2 text-sm text-ink-2">
        Build a customer segment, attach it to a campaign with one or more WhatsApp promotional templates (an
        A/B test if more than one), and dispatch. Every send is consent-gated — a customer who hasn&apos;t opted
        into marketing on WhatsApp is skipped, never messaged. Performance (sent/delivered/skipped/converted) is
        always computed fresh from the underlying message and order history, never a drifting cached counter.
      </p>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Customer segments</h2>
        <div className="mt-3">
          <CreateSegmentForm brands={brands} loyaltyTiers={loyaltyTiers} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-line text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Matches</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <tr key={segment.id} className="border-t border-line">
                <td className="px-4 py-2 font-medium text-ink">{segment.name}</td>
                <td className="px-4 py-2 text-ink-2">{segmentDescription(segment)}</td>
              </tr>
            ))}
            {segments.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-ink-3">
                  No customer segments yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Campaigns</h2>
        {blastTemplates.length === 0 ? (
          <p className="mt-1 text-xs text-warn">
            No active WhatsApp promotional templates yet — add one under Communications before creating a campaign.
          </p>
        ) : null}
        <div className="mt-3">
          <CreateCampaignForm segments={segments} templates={blastTemplates} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-line text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Segment</th>
              <th className="px-4 py-2">Variants</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Scheduled for</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="border-t border-line">
                <td className="px-4 py-2 font-medium text-ink">
                  <Link href={`/campaigns/${campaign.id}`} className="hover:underline">
                    {campaign.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-ink-2">{campaign.segment.name}</td>
                <td className="px-4 py-2 text-ink-2">{campaign.variants.length}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[campaign.status]}`}>
                    {campaign.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-ink-2">
                  {campaign.scheduledFor ? new Date(campaign.scheduledFor).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <CampaignActions campaignId={campaign.id} status={campaign.status} />
                </td>
              </tr>
            ))}
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                  No campaigns yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
