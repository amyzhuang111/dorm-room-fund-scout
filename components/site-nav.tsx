"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useUserPipeline } from "./user-pipeline-provider";

const SECTIONS = [
  { id: "map", href: "/", label: "Map" },
  { id: "explore", href: "/founders", label: "Explore" },
  { id: "signals", href: "/signals", label: "Signals" },
  { id: "work", href: "/work/shortlist", label: "Work" },
] as const;

function sectionFor(pathname: string): (typeof SECTIONS)[number]["id"] | null {
  if (pathname === "/" || pathname.startsWith("/map")) return "map";
  if (pathname.startsWith("/founders") || pathname.startsWith("/companies") || pathname.startsWith("/campuses") || pathname.startsWith("/startup/")) return "explore";
  if (pathname.startsWith("/signals")) return "signals";
  if (pathname.startsWith("/work")) return "work";
  return null;
}

const SUBS: Record<string, { href: string; label: string }[]> = {
  map: [
    { href: "/", label: "Globe" },
    { href: "/map/network", label: "Network" },
    { href: "/map/hotspots", label: "Hotspots" },
  ],
  explore: [
    { href: "/campuses", label: "Campuses" },
    { href: "/founders", label: "Founders" },
    { href: "/companies", label: "Companies" },
  ],
  signals: [
    { href: "/signals", label: "Feed" },
    { href: "/signals/sources", label: "Sources" },
  ],
  work: [
    { href: "/work/shortlist", label: "Shortlist" },
    { href: "/work/pipeline", label: "Pipeline" },
    { href: "/work/verify", label: "Verification" },
  ],
};

function subActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/signals") return pathname === "/signals";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SiteNav() {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  const pipeline = useUserPipeline();
  const local = pipeline.storage === "local";
  const [open, setOpen] = useState(false);
  const [night, setNight] = useState(pathname === "/");
  const subs = section && pathname !== "/" ? SUBS[section] : [];

  useEffect(() => {
    setNight(document.documentElement.dataset.theme !== "day");
  }, [pathname]);

  function openAsk() {
    window.dispatchEvent(new Event("campus-scout-open-ask"));
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "night" ? "day" : "night";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("campus-scout-theme", next);
    setNight(next === "night");
  }

  return (
    <div className="border-b border-line bg-bg">
      <div className="flex h-16 items-center gap-4 px-6">
        <Link href="/" className="wordmark shrink-0">
          <span className="mark" aria-hidden />
          Campus Scout
        </Link>
        <nav className="ml-6 hidden items-center gap-5 md:flex" aria-label="Sections">
          {SECTIONS.map((item) => (
            <Link key={item.id} href={item.href} className={`nav-link ${section === item.id ? "is-active" : ""}`}>
              {item.label}
              {item.id === "work" && local ? (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" title={pipeline.notice ?? "Pipeline entries are saved only in this browser."} />
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          {pathname !== "/" && (
            <button type="button" className="ask-field" onClick={openAsk}>
              Ask anything… ⌘K
            </button>
          )}
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-line text-fg" onClick={toggleTheme} aria-label={night ? "Switch to day" : "Switch to night"}>
            {night ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
        <button type="button" className="ml-auto text-sm text-fg md:hidden" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          Menu
        </button>
      </div>
      {open && (
        <div className="space-y-1 border-t border-line px-5 py-3 md:hidden">
          {SECTIONS.map((item) => (
            <Link key={item.id} href={item.href} className="block py-1 text-sm text-fg" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          {pathname !== "/" && (
            <button type="button" className="block py-1 text-sm text-fg-2" onClick={openAsk}>
              Ask
            </button>
          )}
          <Link href="/methodology" className="block py-1 text-sm text-fg-2" onClick={() => setOpen(false)}>Methodology</Link>
          <Link href="/settings" className="block py-1 text-sm text-fg-2" onClick={() => setOpen(false)}>Settings</Link>
        </div>
      )}
      {subs.length > 0 && (
        <div className="flex h-10 items-end gap-5 px-6">
          {subs.map((item) => (
            <Link key={item.href} href={item.href} className={`subtab ${subActive(pathname, item.href) ? "is-active" : ""}`}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
    </svg>
  );
}
