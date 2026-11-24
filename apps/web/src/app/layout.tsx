import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "./register-service-worker";

export const metadata: Metadata = {
  title: "KitchenOS",
  description: "Restaurant chalane ka pura system — order, kitchen, stock, report",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "KitchenOS" },
};

export const viewport: Viewport = {
  themeColor: "#4338ca",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Linked rather than bundled so a build never depends on reaching Google. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font --
            that rule is about pages/_document; in the App Router a <link> in the
            root layout's <head> loads for every route, which is what we want. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Outfit:wght@500;600;700&display=swap"
        />
      </head>
      <body className="antialiased">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
