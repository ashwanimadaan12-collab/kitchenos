"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@kitchenos/shared";
import { Button, Select } from "@kitchenos/ui";
import { InstallAppButton } from "./install-app-button";

interface AdminShellProps {
  session: SessionUser;
  activeOrgId: string | null;
  children: React.ReactNode;
}

// Shown flat, always expanded — what a restaurant actually touches every day.
// Icon + plain label so the item is recognizable at a glance, not just by reading English.
const DAILY_NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "\u{1F3E0}" },
  { href: "/quick-setup", label: "Quick Setup", icon: "\u{1F680}" },
  { href: "/pos", label: "Take Order", icon: "\u{1F9FE}" },
  { href: "/tables", label: "Tables", icon: "\u{1F37D}️" },
  { href: "/kds", label: "Kitchen Screen", icon: "\u{1F373}" },
  { href: "/menus", label: "Menu", icon: "\u{1F4D6}" },
  { href: "/customers", label: "Customers", icon: "\u{1F465}" },
  { href: "/reports", label: "Sales Report", icon: "\u{1F4CA}" },
];

// Everything else, grouped under collapsible sections so first-time setup
// doesn't bury the daily-use items above in a 29-item flat list.
const NAV_GROUPS = [
  {
    label: "Setup",
    icon: "⚙️",
    items: [
      { href: "/organizations", label: "Organizations" },
      { href: "/brands", label: "Brands" },
      { href: "/kitchens", label: "Kitchens" },
      { href: "/outlets", label: "Outlets" },
      { href: "/products", label: "Products" },
      { href: "/ingredients", label: "Ingredients" },
      { href: "/recipes", label: "Recipes" },
      { href: "/combos", label: "Combos" },
    ],
  },
  {
    label: "Stock & Suppliers",
    icon: "\u{1F4E6}",
    items: [
      { href: "/suppliers", label: "Suppliers" },
      { href: "/purchase-orders", label: "Purchase Orders" },
      { href: "/inventory", label: "Inventory" },
    ],
  },
  {
    label: "Marketing & Growth",
    icon: "\u{1F4E3}",
    items: [
      { href: "/promotions", label: "Promotions" },
      { href: "/loyalty", label: "Loyalty" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/communications", label: "Communications" },
      { href: "/growth", label: "Growth Dashboard" },
      { href: "/demand", label: "Demand" },
      { href: "/recommendations", label: "Recommendations" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    label: "Admin",
    icon: "\u{1F512}",
    items: [
      { href: "/expenses", label: "Expenses" },
      { href: "/employees", label: "Employees" },
      { href: "/audit-logs", label: "Audit Logs" },
      { href: "/sessions", label: "Sessions" },
    ],
  },
];

export function AdminShell({ session, activeOrgId, children }: AdminShellProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

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

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-60 border-r border-slate-200 bg-white px-4 py-6">
        <div className="mb-8 px-2 text-lg font-semibold text-slate-900">KitchenOS</div>
        <nav className="space-y-1">
          {DAILY_NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </a>
          ))}

          <div className="mt-4 space-y-1 border-t border-slate-200 pt-4">
            {NAV_GROUPS.map((group) => {
              const isOpen = !!openGroups[group.label];
              return (
                <div key={group.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base leading-none">{group.icon}</span>
                      {group.label}
                    </span>
                    <span>{isOpen ? "−" : "+"}</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-1 pb-1">
                      {group.items.map((item) => (
                        <a
                          key={item.href}
                          href={item.href}
                          className="block rounded-md px-2 py-2 pl-5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <Select
              aria-label="Organization"
              value={activeOrgId ?? ""}
              onChange={(e) => onOrgChange(e.target.value)}
              options={session.memberships.map((m) => ({ value: m.organizationId, label: m.organizationName }))}
              placeholder="Select organization"
            />
            {/* POS and KDS have their own outlet/station pickers; these header selectors are unused for now. */}
            <Select aria-label="Brand" disabled options={[]} placeholder="All brands" />
            <Select aria-label="Outlet" disabled options={[]} placeholder="All outlets" />
          </div>

          <div className="flex items-center gap-3">
            <InstallAppButton />
            <span className="text-sm text-slate-600">
              {session.firstName} {session.lastName}
            </span>
            <Button variant="secondary" isLoading={isLoggingOut} onClick={onLogout}>
              Log out
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
