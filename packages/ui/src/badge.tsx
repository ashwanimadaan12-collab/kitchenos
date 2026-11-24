import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "bad" | "brand";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  good: "bg-good-tint text-good",
  warn: "bg-warn-tint text-warn",
  bad: "bg-bad-tint text-bad",
  brand: "bg-brand-tint text-brand-tint-ink",
};

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

/** Order status, stock state, channel. Tone carries the meaning, the word repeats it —
 *  colour alone never tells the story. */
export function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export interface CountProps {
  value: number;
  tone?: Extract<Tone, "bad" | "brand" | "warn">;
  label: string;
}

/** The number on a nav item ("6 orders pending"). The label is for screen readers,
 *  because a bare digit tells them nothing. */
export function Count({ value, tone = "bad", label }: CountProps) {
  const bg = tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-brand";
  return (
    <span
      className={`tnum inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white ${bg}`}
    >
      {value}
      <span className="sr-only"> {label}</span>
    </span>
  );
}
