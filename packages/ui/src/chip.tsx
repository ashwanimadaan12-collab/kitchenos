"use client";

import type { ReactNode } from "react";

export interface ChipProps {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
}

/** A real toggle button, not a styled div — Tab reaches it and aria-pressed
 *  tells a screen reader which one is on. Used for order type and category. */
export function Chip({ selected, onSelect, children, className = "" }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`min-h-12 rounded-control px-5 text-[15px] font-semibold transition-colors ${
        selected
          ? "border-2 border-brand bg-brand-tint font-bold text-brand-tint-ink"
          : "border border-line-strong bg-surface text-ink-2 hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {children}
    </div>
  );
}
