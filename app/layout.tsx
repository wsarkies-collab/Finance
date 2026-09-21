import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "stockval",
  description: "Screens stocks across five valuation formulas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="topnav">
          <a href="/" className="brand">
            stockval
          </a>
          <a href="/momentum">Momentum</a>
          <a href="/watchlist">Watchlist</a>
          <a href="/login">Log in</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
