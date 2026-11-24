import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid = false, className = "", ...rest }: InputProps) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={`min-h-12 w-full rounded-control border bg-surface px-4 text-[15px] text-ink placeholder:text-ink-3 ${
        invalid ? "border-bad" : "border-line-strong"
      } ${className}`}
    />
  );
}

export interface FieldProps {
  /** Must match the control's id — the label is always real, never a floating div. */
  htmlFor: string;
  label: string;
  /** Shown under the control; says what to do, not just that something is wrong. */
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ htmlFor, label, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-bold text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-2">{hint}</p> : null}
      {error ? (
        <p className="text-xs font-semibold text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
