"use client";

import { useEffect } from "react";

/** Triggers the browser's print dialog as soon as the page is ready — the whole point of a
 *  dedicated /print route is that opening it IS the "print this" action. A manual button next to
 *  it (rendered by the page itself, hidden via `print:hidden` so it never shows up on paper)
 *  covers browsers that block an unprompted window.print() call or a cashier wanting a reprint. */
export function AutoPrint() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 150);
    return () => clearTimeout(id);
  }, []);
  return null;
}
