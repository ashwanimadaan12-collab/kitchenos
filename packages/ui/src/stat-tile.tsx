import type { ReactNode } from "react";

export interface StatTileProps {
  label: string;
  value: string;
  /** One line under the number: the comparison or the breakdown. */
  note?: ReactNode;
  tone?: "normal" | "warn" | "bad";
}

/** The four numbers an owner reads in five seconds. A tone paints a stripe down
 *  the left edge so a number that needs attention is visible without reading it. */
export function StatTile({ label, value, note, tone = "normal" }: StatTileProps) {
  const stripe =
    tone === "bad"
      ? "border-l-4 border-l-bad"
      : tone === "warn"
        ? "border-l-4 border-l-warn"
        : "";
  return (
    <div className={`rounded-card border border-line bg-surface p-5 ${stripe}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-2">{label}</p>
      <p className="tnum mt-2 font-display text-[32px] font-bold leading-none tracking-tight text-ink">
        {value}
      </p>
      {note ? <div className="mt-2 text-[12.5px] text-ink-2">{note}</div> : null}
    </div>
  );
}
