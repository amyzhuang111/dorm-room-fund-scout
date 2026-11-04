"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const pipeline = useUserPipeline();
  const local = pipeline.storage === "local";
  const [open, setOpen] = useState(false);

  function openAsk() {
    window.dispatchEvent(new Event("campus-scout-open-ask"));
  }

  const onCompaniesDesk =
    pathname.startsWith("/companies") || pathname.startsWith("/startup/");

  return (
    <div className="border-b border-line bg-[#FFFFFF]" data-site-nav="merged" data-slim-companies-nav={onCompaniesDesk ? "1" : undefined}>
      <div className={`flex items-center gap-3 px-3 pt-[env(safe-area-inset-top)] sm:gap-4 sm:px-5 ${onCompaniesDesk ? "min-h-10" : "min-h-12"}`}>
        <Link href="/" className={`wordmark inline-flex items-center shrink-0 ${onCompaniesDesk ? "min-h-9 text-[14px]" : "min-h-11"}`}>
          <span className="mark" aria-hidden />
          <span className={onCompaniesDesk ? "max-[380px]:hidden" : undefined}>Campus Scout</span>
          <span className={onCompaniesDesk ? "hidden max-[380px]:inline" : "hidden"}>CS</span>
        </Link>
        {onCompaniesDesk ? (
          <nav className="ml-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:hidden" aria-label="Views" data-mobile-view-tabs="">
            {([
              { href: "/companies", label: "Companies", active: pathname.startsWith("/companies") && searchParams.get("feed") !== "leaderboard" },
              { href: "/companies?feed=leaderboard", label: "Signals", active: pathname.startsWith("/companies") && searchParams.get("feed") === "leaderboard" },
              { href: "/", label: "Map", active: false },
            ]).map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`inline-flex h-8 shrink-0 items-center rounded-sm px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ${
                  item.active
                    ? "bg-[color:var(--cobalt-haze,#E8ECFA)] text-[color:var(--cobalt,#2F4FD8)]"
                    : "text-[color:var(--fg-3,#5C647A)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
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
          <button type="button" className={`inline-flex min-w-11 items-center justify-center px-2 text-[14px] text-fg ${onCompaniesDesk ? "min-h-9" : "min-h-11"}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            Menu
          </button>
        </div>
      </div>
      {/* Desk tabs always on for mobile — not tucked behind Menu */}
      <nav
        className={`max-w-full min-h-9 items-stretch gap-1 overflow-x-auto overscroll-x-contain px-3 md:hidden ${onCompaniesDesk ? "hidden" : "flex"}`}
        aria-label="Desks"
        data-mobile-desk-tabs=""
      >
        {DESK_TABS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`subtab inline-flex min-h-9 shrink-0 items-center px-2 text-[13px] ${item.match(pathname) ? "is-active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {open ? (
        <div className="space-y-1 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          {NAV.map((item) => (
            <Link key={item.id} href={item.href} className="flex min-h-11 items-center text-[14px] text-fg" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <button type="button" className="flex min-h-11 w-full items-center text-[14px] text-fg" onClick={openAsk}>
            Ask anything
          </button>
          <Link href="/methodology" className="flex min-h-11 items-center text-[14px] text-fg-2" onClick={() => setOpen(false)}>
            Methodology
          </Link>
          <Link href="/settings" className="flex min-h-11 items-center text-[14px] text-fg-2" onClick={() => setOpen(false)}>
            Settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
