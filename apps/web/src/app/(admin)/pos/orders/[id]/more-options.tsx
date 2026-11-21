"use client";

import { useState } from "react";

export function MoreOptions({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        {isOpen ? "− Kam options dikhao" : "+ Combo / Discount / Loyalty / Customer"}
      </button>
      {isOpen ? <div className="mt-3 space-y-4">{children}</div> : null}
    </div>
  );
}
