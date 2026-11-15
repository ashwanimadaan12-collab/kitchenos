import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  placeholder?: string;
}

/** Used for the org/brand/outlet selectors in the admin layout header. */
export function Select({ options, placeholder, className = "", ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      className={`rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 ${className}`}
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
