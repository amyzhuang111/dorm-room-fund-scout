"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { discoveryHref } from "@/lib/domain/discovery-navigation";
import { useUserPipeline } from "./user-pipeline-provider";

/** One flat nav (Map + desks + Signals + Work). No second Explore umbrella. */
const NAV = [
  { id: "map", href: "/", label: "Map", match: (p: string) => p === "/" || p.startsWith("/map") },
  { id: "companies", href: "/companies", label: "Companies", match: (p: string) => p.startsWith("/companies") || p.startsWith("/startup/") },
  { id: "campuses", href: "/campuses", label: "Campuses", match: (p: string) => p.startsWith("/campuses") },
  { id: "founders", href: "/founders", label: "Founders", match: (p: string) => (p.startsWith("/founders") || p.startsWith("/founder/")) },
  { id: "networks", href: "/networks", label: "Networks", match: (p: string) => p.startsWith("/networks") },
  { id: "signals", href: "/signals", label: "Signals", match: (p: string) => p.startsWith("/signals") },
  { id: "data", href: "/data", label: "Data", match: (p: string) => p.startsWith("/data") },
  { id: "work", href: "/work/shortlist", label: "Saved", match: (p: string) => p.startsWith("/work") || p === "/compare" },
] as const;

const QUICK_IDS = new Set(["map", "companies", "founders", "networks"]);
const DESK_TABS = NAV.filter(item => QUICK_IDS.has(item.id));

export function SiteNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pipeline = useUserPipeline();
  const local = pipeline.storage === "local";
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const contextPath = pathname === "/" || pathname === "/companies";
  const discoveryLink = (id: "map" | "companies" | "signals") => discoveryHref(id, contextPath ? new URLSearchParams(searchParams) : new URLSearchParams());
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>("a")?.focus();
  }, [open]);
  function closeMenu() { setOpen(false); menuButton.current?.focus(); }

  function openAsk() {
    window.dispatchEvent(new Event("campus-scout-open-ask"));
  }

  return (
    <div className="border-b border-line bg-[#FFF4E8]" data-site-nav="merged">
      <div className="flex min-h-12 items-center gap-3 px-3 pt-[env(safe-area-inset-top)] sm:gap-4 sm:px-5">
        <Link href="/" className="wordmark inline-flex min-h-11 shrink-0 items-center"><span className="mark" aria-hidden />Campus Scout</Link>
        <nav className="ml-2 hidden min-w-0 items-center gap-3 lg:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.id} href={contextPath && (item.id === "map" || item.id === "companies") ? discoveryLink(item.id) : item.href} aria-current={item.match(pathname) ? "page" : undefined} className={`nav-link ${item.match(pathname) ? "is-active" : ""}`}>
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
        <div className="ml-auto hidden items-center xl:flex">
          <button type="button" className="ask-field" onClick={openAsk}>
            Ask Scout
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <button ref={menuButton} type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[14px] text-fg" aria-controls="mobile-site-menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {/* The home workspace supplies its own persistent view and database tabs. */}
      {pathname !== "/" && <nav
        className={`${open ? "hidden" : "grid"} grid-cols-4 px-3 lg:hidden`}
        aria-label="Quick navigation"
        data-mobile-desk-tabs=""
      >
        {DESK_TABS.map((item) => (
          <Link
            key={item.href}
            href={contextPath && (item.id === "map" || item.id === "companies") ? discoveryLink(item.id) : item.href}
            aria-current={item.match(pathname) ? "page" : undefined}
            className={`subtab inline-flex min-h-11 items-center justify-center px-2 text-[13px] ${item.match(pathname) ? "is-active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>}
      {open ? (
        <div ref={menu} id="mobile-site-menu" className="max-h-[75dvh] overflow-y-auto space-y-1 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeMenu(); } }}>
          {NAV.map((item) => (
            <Link key={item.id} href={contextPath && (item.id === "map" || item.id === "companies") ? discoveryLink(item.id) : item.href} aria-current={item.match(pathname) ? "page" : undefined} className="flex min-h-11 items-center text-[14px] text-fg" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <button type="button" className="flex min-h-11 w-full items-center text-[14px] text-fg" onClick={() => { setOpen(false); openAsk(); }}>
            Ask Scout
          </button>
          <Link href="/methodology" className="flex min-h-11 items-center text-[14px] text-fg-2" onClick={() => setOpen(false)}>
            Methodology
          </Link>
        </div>
      ) : null}
    </div>
  );
}
