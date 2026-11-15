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

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pos", label: "POS" },
  { href: "/tables", label: "Tables" },
  { href: "/kds", label: "KDS" },
  { href: "/organizations", label: "Organizations" },
  { href: "/brands", label: "Brands" },
  { href: "/kitchens", label: "Kitchens" },
  { href: "/outlets", label: "Outlets" },
  { href: "/products", label: "Products" },
  { href: "/menus", label: "Menus" },
  { href: "/ingredients", label: "Ingredients" },
  { href: "/recipes", label: "Recipes" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/purchase-orders", label: "Purchase Orders" },
  { href: "/inventory", label: "Inventory" },
  { href: "/combos", label: "Combos" },
  { href: "/promotions", label: "Promotions" },
  { href: "/reports", label: "Reports" },
  { href: "/growth", label: "Growth Dashboard" },
  { href: "/demand", label: "Demand" },
  { href: "/expenses", label: "Expenses" },
  { href: "/employees", label: "Employees" },
  { href: "/customers", label: "Customers" },
  { href: "/communications", label: "Communications" },
  { href: "/loyalty", label: "Loyalty" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/pricing", label: "Pricing" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/audit-logs", label: "Audit Logs" },
  { href: "/sessions", label: "Sessions" },
];

export function AdminShell({ session, activeOrgId, children }: AdminShellProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block rounded-md px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </a>
          ))}
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
