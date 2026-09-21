"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <nav className="topnav">
        <button type="button" className="brand-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          stockval
        </button>
      </nav>

      <div className={`sidebar-backdrop${open ? " open" : ""}`} onClick={() => setOpen(false)} aria-hidden={!open}>
        <div
          className="sidebar-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sidebar-header">
            <span className="sidebar-brand">stockval</span>
            <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Close menu">
              ×
            </button>
          </div>
          <div className="sidebar-links">
            <Link href="/" className="sidebar-link" aria-current={pathname === "/" ? "page" : undefined}>
              Home
            </Link>
            <Link
              href="/momentum"
              className="sidebar-link"
              aria-current={pathname === "/momentum" ? "page" : undefined}
            >
              Momentum
            </Link>
            <button type="button" className="sidebar-link sidebar-link-placeholder" disabled title="Coming soon">
              Watchlist
              <span className="sidebar-badge">Coming soon</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
