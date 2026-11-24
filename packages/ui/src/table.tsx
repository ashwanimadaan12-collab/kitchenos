import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

/** Wraps a table so a wide one scrolls inside its own box instead of pushing
 *  the whole page sideways on a tablet. */
export function TableBox({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function TH({ className = "", children, ...rest }: ThHTMLAttributes<HTMLElement>) {
  return (
    <th
      scope="col"
      {...rest}
      className={`px-4 py-2.5 text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-2 ${className}`}
    >
      {children}
    </th>
  );
}

export function TD({ className = "", children, ...rest }: TdHTMLAttributes<HTMLElement>) {
  return (
    <td {...rest} className={`px-4 py-3 align-middle text-ink ${className}`}>
      {children}
    </td>
  );
}

export function TR({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <tr className={`border-t border-line ${className}`}>{children}</tr>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-ink-3">
        {children}
      </td>
    </tr>
  );
}
