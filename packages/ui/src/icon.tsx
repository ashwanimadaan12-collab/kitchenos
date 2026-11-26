import type { SVGProps } from "react";

/** One stroke-icon set, so the app looks the same on Windows, Android and iPad.
 *  Emoji don't: each platform ships its own drawing and they render at
 *  different weights and sizes next to text. */
export type IconName =
  | "home"
  | "order"
  | "kitchen"
  | "table"
  | "menu"
  | "report"
  | "settings"
  | "plus"
  | "minus"
  | "back"
  | "chevron"
  | "search"
  | "alert"
  | "install"
  | "logout"
  | "logo"
  | "rider"
  | "track";

const PATHS: Record<IconName, string[]> = {
  home: ["M3 10.5 12 3l9 7.5", "M5 10v10h14V10"],
  order: ["M6 3h12l1 18H5L6 3Z", "M9 7h6", "M9 11h6"],
  kitchen: ["M4 7h16", "M6 7v12h12V7", "M10 11v4", "M14 11v4"],
  table: ["M12 3v18", "M4 8h16", "M6 8c0 6 2 9 6 9s6-3 6-9"],
  menu: ["M4 5h16v14H4z", "M8 9h8", "M8 13h5"],
  report: ["M4 19V9", "M10 19V5", "M16 19v-7", "M22 19H2"],
  settings: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  ],
  plus: ["M12 5v14M5 12h14"],
  minus: ["M6 12h12"],
  back: ["M15 18l-6-6 6-6"],
  chevron: ["M6 9l6 6 6-6"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M21 21l-4.3-4.3"],
  alert: ["M12 8v5", "M12 17h.01", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"],
  install: ["M12 3v12", "M7 11l5 5 5-5", "M4 21h16"],
  logout: ["M15 17l5-5-5-5", "M20 12H9", "M13 3H5v18h8"],
  rider: [
    "M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    "M8 17h7l-3-7H9",
    "M13 10l2-4h3",
  ],
  track: ["M4 7h7", "M4 12h11", "M4 17h5", "M14 18l2.5 2.5L21 16"],
  logo: ["M5 4v7a3 3 0 0 0 6 0V4", "M8 11v9", "M17 4c-1.4 2-2 4-2 6s.6 3 2 3 2-1 2-3-.6-4-2-6Z", "M17 13v7"],
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  /** Give this when the icon is the only content of a button or link. */
  title?: string;
}

export function Icon({ name, size = 18, title, strokeWidth = 1.9, ...rest }: IconProps) {
  return (
    <svg
      {...rest}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
