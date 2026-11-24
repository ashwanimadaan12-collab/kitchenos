import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  /** Stretches the button to its container — used for the one obvious action on a panel. */
  block?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink hover:bg-brand-hover",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-bad text-white hover:opacity-90",
};

// Every size clears 44px so a finger on a counter tablet hits it first time.
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-12 px-5 text-[15px]",
  lg: "min-h-14 px-6 text-[17px]",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  block = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-control font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        SIZE_CLASS[size]
      } ${VARIANT_CLASS[variant]} ${block ? "w-full" : ""} ${className}`}
    >
      {isLoading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
