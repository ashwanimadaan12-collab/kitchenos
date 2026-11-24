import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  placeholder?: string;
}

export function Select({ options, placeholder, className = "", ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      className={`min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm font-medium text-ink disabled:opacity-60 ${className}`}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
