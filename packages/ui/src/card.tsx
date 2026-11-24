import type { ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** "flush" drops the padding when the card holds a table or a full-width list. */
  padding?: "normal" | "flush";
}

export function Card({ children, className = "", padding = "normal" }: CardProps) {
  return (
    <section
      className={`rounded-card border border-line bg-surface ${padding === "normal" ? "p-5" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export interface CardHeaderProps {
  title: string;
  /** A "see all" link or a filter — sits opposite the title. */
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, action, className = "" }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h2 className="font-display text-[17px] font-bold text-ink">{title}</h2>
      {action}
    </div>
  );
}
