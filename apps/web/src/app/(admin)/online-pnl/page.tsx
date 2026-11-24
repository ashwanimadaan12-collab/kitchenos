import Link from "next/link";
import { cheapestPlanWith, getPlan, hasFeature } from "@kitchenos/shared";
import { Card, CardHeader, Icon, TableBox, TD, TH, TR } from "@kitchenos/ui";
import { apiFetch } from "@/lib/api";
import { getActiveOrganizationId, getSession } from "@/lib/session";
import { SettlementClient } from "./settlement-client";

/**
 * Reconciling what Zomato and Swiggy actually paid. Gated on the plan, which is
 * also the first screen where a locked feature has to explain itself rather
 * than just disappear from the menu.
 */
interface PastSettlement {
  id: string;
  platform: string;
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  orderCount: number;
  grossSales: string;
  calculatedNetPayout: string;
}

function rupees(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? `₹${Math.round(n).toLocaleString("en-IN")}` : "₹0";
}

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
}

export default async function OnlinePnlPage() {
  const [session, activeOrgId] = await Promise.all([getSession(), getActiveOrganizationId()]);
  const membership =
    session?.memberships.find((m) => m.organizationId === activeOrgId) ?? session?.memberships[0];
  const planCtx = { planId: membership?.plan, trialEndsAt: membership?.trialEndsAt ?? null };
  const allowed = hasFeature(planCtx, "aggregator_reconciliation");
  const needed = cheapestPlanWith("aggregator_reconciliation");

  const pastRes = allowed ? await apiFetch("/v1/settlements") : null;
  const past: PastSettlement[] = pastRes?.ok ? await pastRes.json() : [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Online P&amp;L</h1>
        <p className="mt-1 text-sm text-ink-2">
          Zomato aur Swiggy ki payout report upload karo — commission, discount aur fees ke baad asli kamai
          dikhegi, aur jo order ka hisaab nahi milta wo alag se.
        </p>
      </header>

      {allowed ? (
        <>
          <SettlementClient />

          {past.length > 0 ? (
            <Card padding="flush">
              <CardHeader title="Purani reports" className="border-b border-line p-5" />
              <TableBox caption="Pehle upload ki gayi settlement reports">
                <thead>
                  <tr>
                    <TH>Platform</TH>
                    <TH>Period</TH>
                    <TH className="text-right">Order</TH>
                    <TH className="text-right">Gross</TH>
                    <TH className="text-right">Bank me aaya</TH>
                    <TH />
                  </tr>
                </thead>
                <tbody>
                  {past.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-semibold">{p.platform}</TD>
                      <TD>
                        {day(p.periodStart)} – {day(p.periodEnd)}
                      </TD>
                      <TD className="tnum text-right">{p.orderCount}</TD>
                      <TD className="tnum text-right">{rupees(p.grossSales)}</TD>
                      <TD className="tnum text-right">{rupees(p.calculatedNetPayout)}</TD>
                      <TD className="text-right">
                        <Link href={`/online-pnl/${p.id}`} className="font-bold text-brand hover:underline">
                          Kholo
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableBox>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <div className="flex flex-col items-start gap-3">
            <span className="text-warn">
              <Icon name="alert" size={24} strokeWidth={2.2} />
            </span>
            <h2 className="font-display text-lg font-bold text-ink">
              Ye {getPlan(membership?.plan).name} plan me nahi hai
            </h2>
            <p className="max-w-prose text-sm text-ink-2">
              Zomato/Swiggy reconciliation{needed ? ` ${needed.name} plan (₹${needed.pricePerYear.toLocaleString("en-IN")}/saal)` : ""}{" "}
              me milta hai. Isse pata chalta hai ki har ₹100 ki online sale me se aapke paas kitna bachta hai, aur
              kis order ka paisa kam aaya.
            </p>
            <Link
              href="/plans"
              className="inline-flex min-h-12 items-center rounded-control bg-brand px-5 text-[15px] font-bold text-brand-ink no-underline"
            >
              Plans dekho
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
