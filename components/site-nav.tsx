"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUserPipeline } from "./user-pipeline-provider";

/** One flat nav (Map + desks + Signals + Work). No second Explore umbrella. */
const NAV = [
  { id: "map", href: "/", label: "Map", match: (p: string) => p === "/" || p.startsWith("/map") },
  { id: "companies", href: "/companies", label: "Companies", match: (p: string) => p.startsWith("/companies") || p.startsWith("/startup/") },
  { id: "campuses", href: "/campuses", label: "Campuses", match: (p: string) => p.startsWith("/campuses") },
  { id: "founders", href: "/founders", label: "Founders", match: (p: string) => p.startsWith("/founders") },
  { id: "networks", href: "/networks", label: "Networks", match: (p: string) => p.startsWith("/networks") },
  { id: "signals", href: "/signals", label: "Signals", match: (p: string) => p.startsWith("/signals") },
  { id: "data", href: "/data", label: "Data", match: (p: string) => p.startsWith("/data") },
  { id: "work", href: "/work/shortlist", label: "Work", match: (p: string) => p.startsWith("/work") },
] as const;

/** Always-visible mobile desk row (Taste r33 blind: Menu-only hurt all 3 raters). */
const DESK_TABS = [
  { href: "/campuses", label: "Campuses", match: (p: string) => p.startsWith("/campuses") },
  { href: "/founders", label: "Founders", match: (p: string) => p.startsWith("/founders") },
  { href: "/networks", label: "Networks", match: (p: string) => p.startsWith("/networks") },
  { href: "/companies", label: "Companies", match: (p: string) => p.startsWith("/companies") || p.startsWith("/startup/") },
  { href: "/data", label: "Data", match: (p: string) => p.startsWith("/data") },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const pipeline = useUserPipeline();
  const local = pipeline.storage === "local";
  const [open, setOpen] = useState(false);

  function openAsk() {
    window.dispatchEvent(new Event("campus-scout-open-ask"));
  }

  return (
    <div className="border-b border-line bg-bg" data-site-nav="merged">
      <div className="flex h-12 items-center gap-4 px-5">
        <Link href="/" className="wordmark shrink-0">
          <span className="mark" aria-hidden />
          Campus Scout
        </Link>
        <nav className="ml-4 hidden min-w-0 items-center gap-4 overflow-x-auto md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.id} href={item.href} className={`nav-link ${item.match(pathname) ? "is-active" : ""}`}>
              {item.label}
              {item.id === "work" && local ? (
                <span
                  className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#c8c8d2] align-middle"
                  title={pipeline.notice ?? "Pipeline entries are saved only in this browser."}
                />
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center md:flex">
          <button type="button" className="ask-field" onClick={openAsk}>
            Ask anything ⌘K
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2 md:hidden">
          <button type="button" className="text-sm text-fg" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            Menu
          </button>
        </div>
      </div>
      {/* Desk tabs always on for mobile — not tucked behind Menu */}
      <nav
        className="flex h-10 items-end gap-5 overflow-x-auto px-5 md:hidden"
        aria-label="Desks"
        data-mobile-desk-tabs=""
      >
        {DESK_TABS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`subtab shrink-0 ${item.match(pathname) ? "is-active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {open ? (
        <div className="space-y-1 border-t border-line px-5 py-3 md:hidden">
          {NAV.map((item) => (
            <Link key={item.id} href={item.href} className="block py-1 text-sm text-fg" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <button type="button" className="block py-1 text-sm text-fg" onClick={openAsk}>
            Ask anything ⌘K
          </button>
          <Link href="/methodology" className="block py-1 text-sm text-fg-2" onClick={() => setOpen(false)}>
            Methodology
          </Link>
          <Link href="/settings" className="block py-1 text-sm text-fg-2" onClick={() => setOpen(false)}>
            Settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
