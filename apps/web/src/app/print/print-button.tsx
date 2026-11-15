"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="mb-4 w-full rounded-md bg-slate-900 py-2 text-sm font-sans text-white print:hidden"
    >
      Print
    </button>
  );
}
