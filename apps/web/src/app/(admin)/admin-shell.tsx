"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@kitchenos/shared";
import { getPlan, isTrialActive } from "@kitchenos/shared";
import { Button, Icon, Select, type IconName } from "@kitchenos/ui";
import { OrderAlarm } from "@/components/order-alarm";
import { InstallAppButton } from "./install-app-button";

interface AdminShellProps {
  session: SessionUser;
  activeOrgId: string | null;
  children: React.ReactNode;
}

/**
 * The seven things a restaurant touches every day. Everything else moved behind
 * "Settings" — a cashier mid-rush should not be scrolling past "Audit Logs" to
 * reach the order screen.
 */
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Aaj", icon: "home" },
  { href: "/pos", label: "Order lo", icon: "order" },
  { href: "/dhandha", label: "Dhandha", icon: "report" },
  { href: "/kds", label: "Kitchen", icon: "kitchen" },
  { href: "/tables", label: "Tables", icon: "table" },
  { href: "/menus", label: "Menu", icon: "menu" },
  { href: "/reports", label: "Report", icon: "report" },
];

/** Setup and back-office. Opened from the Settings tab, not carried in the main bar. */
const SETTINGS_GROUPS = [
  {
    label: "Restaurant set up",
    items: [
      { href: "/quick-setup", label: "Quick Setup" },
      { href: "/organizations", label: "Organizations" },
      { href: "/brands", label: "Brands" },
      { href: "/outlets", label: "Outlets" },
      { href: "/kitchens", label: "Kitchens" },
    ],
  },
  {
    label: "Menu & recipe",
    items: [
      { href: "/products", label: "Products" },
      { href: "/combos", label: "Combos" },
      { href: "/recipes", label: "Recipes" },
      { href: "/ingredients", label: "Ingredients" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    label: "Stock & supplier",
    items: [
      { href: "/inventory", label: "Inventory" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/purchase-orders", label: "Purchase Orders" },
      { href: "/demand", label: "Demand" },
    ],
  },
  {
    label: "Customer & marketing",
    items: [
      { href: "/customers", label: "Customers" },
      { href: "/loyalty", label: "Loyalty" },
      { href: "/promotions", label: "Promotions" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/communications", label: "Communications" },
      { href: "/growth", label: "Growth (detail)" },
      { href: "/recommendations", label: "Recommendations" },
    ],
  },
  {
    label: "Hisaab & admin",
    items: [
      { href: "/online-pnl", label: "Online P&L (Zomato/Swiggy)" },
      { href: "/expenses", label: "Expenses" },
      { href: "/employees", label: "Employees" },
      { href: "/sessions", label: "Sessions" },
      { href: "/plans", label: "Plans" },
      { href: "/audit-logs", label: "Audit Logs" },
    ],
  },
];

/** Order taking and the kitchen screen run for whole shifts, often in a bright
 *  kitchen. They get the dark palette; the office screens stay light. */
const DARK_ROUTES = ["/pos", "/kds"];

export function AdminShell({ session, activeOrgId, children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isDark = DARK_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  const membership =
    session.memberships.find((m) => m.organizationId === activeOrgId) ?? session.memberships[0];
  const plan = getPlan(membership?.plan);
  const onTrial = isTrialActive(membership?.trialEndsAt ?? null);
  // Rounded up, so the last partial day still reads as "1 din".
  const trialDaysLeft =
    onTrial && membership?.trialEndsAt
      ? Math.ceil((new Date(membership.trialEndsAt).getTime() - Date.now()) / 86_400_000)
      : 0;

  async function onLogout() {
    setIsLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function onOrgChange(organizationId: string) {
    await fetch("/api/organizations/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div data-theme={isDark ? "dark" : undefined} className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex flex-col gap-3 border-b border-line bg-surface px-5 pt-3.5 sm:px-7">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/dashboard" className="flex items-center gap-2.5 text-ink no-underline">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-ink">
              <Icon name="logo" size={18} strokeWidth={2.3} />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">KitchenOS</span>
          </a>

          <Select
            aria-label="Organization"
            value={activeOrgId ?? ""}
            onChange={(e) => onOrgChange(e.target.value)}
            options={session.memberships.map((m) => ({
              value: m.organizationId,
              label: m.organizationName,
            }))}
            placeholder="Organization chuno"
          />

          <div className="ml-auto flex items-center gap-3">
            <a
              href="/plans"
              className="hidden rounded-lg bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand-tint-ink no-underline sm:inline"
            >
              {plan.name}
            </a>
            <InstallAppButton />
            <span className="hidden text-sm font-medium text-ink-2 sm:inline">
              {session.firstName} {session.lastName}
            </span>
            <Button variant="ghost" size="sm" isLoading={isLoggingOut} onClick={onLogout}>
              <Icon name="logout" size={16} />
              Nikal jao
            </Button>
          </div>
        </div>

        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <a
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-2 border-b-[3px] px-4 text-[14.5px] no-underline ${
                  active
                    ? "border-brand font-bold text-brand-tint-ink"
                    : "border-transparent font-medium text-ink-2 hover:text-ink"
                }`}
              >
                <Icon name={tab.icon} size={17} />
                {tab.label}
              </a>
            );
          })}

          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className={`flex min-h-12 items-center gap-2 border-b-[3px] px-4 text-[14.5px] ${
              settingsOpen
                ? "border-brand font-bold text-brand-tint-ink"
                : "border-transparent font-medium text-ink-2 hover:text-ink"
            }`}
          >
            <Icon name="settings" size={17} />
            Settings
            <Icon name="chevron" size={15} className={settingsOpen ? "rotate-180" : ""} />
          </button>
        </nav>
      </header>

      {onTrial ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-warn-line bg-warn-tint px-5 py-2 sm:px-7">
          <span className="text-sm font-bold text-warn">
            Trial ke {trialDaysLeft} din bache — abhi sab features khule hain
          </span>
          <a
            href="/plans"
            className="ml-auto text-sm font-bold text-warn underline underline-offset-2"
          >
            Plans dekho
          </a>
        </div>
      ) : null}

      {/* Sits directly under the header so a ringing order is the first thing
          on screen, on every admin page. */}
      <OrderAlarm />

      {settingsOpen ? (
        <div className="border-b border-line bg-surface-2 px-5 py-6 sm:px-7">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {SETTINGS_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-2">{group.label}</p>
                <ul className="mt-2.5 flex flex-col">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className="block rounded-lg py-2 pl-2 text-sm font-medium text-ink no-underline hover:bg-surface"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <main className="flex-1 px-5 py-6 sm:px-7">{children}</main>
    </div>
  );
}
