"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
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
    { href: "/companies?sample=1", label: "Companies" },
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
  const path = href.split("?")[0] ?? href;
  if (path === "/") return pathname === "/";
  if (path === "/signals") return pathname === "/signals";
  return pathname === path || pathname.startsWith(path + "/");
}

export function SiteNav() {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  const pipeline = useUserPipeline();
  const local = pipeline.storage === "local";
  const [open, setOpen] = useState(false);
  const night = useSyncExternalStore(
    (notify) => {
      window.addEventListener("campus-scout-theme", notify);
      return () => window.removeEventListener("campus-scout-theme", notify);
    },
    () => document.documentElement.dataset.theme !== "day",
    () => true,
  );
  const campusDetail = /^\/campuses\/[^/]+$/.test(pathname);
  const subs = section && pathname !== "/" && !campusDetail ? SUBS[section] : [];

  function openAsk() {
    window.dispatchEvent(new Event("campus-scout-open-ask"));
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "night" ? "day" : "night";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("campus-scout-theme", next);
    window.dispatchEvent(new Event("campus-scout-theme"));
  }

  return (
    <div className="border-b border-line bg-bg">
      <div className="flex h-12 items-center gap-4 px-5">
        <Link href="/" className="wordmark shrink-0">
          <span className="mark" aria-hidden />
          Campus Scout
        </Link>
        <nav className="ml-4 hidden items-center gap-4 md:flex" aria-label="Sections">
          {SECTIONS.map((item) => (
            <Link key={item.id} href={item.href} className={`nav-link ${section === item.id ? "is-active" : ""}`}>
              {item.label}
              {item.id === "work" && local ? (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#c8c8d2] align-middle" title={pipeline.notice ?? "Pipeline entries are saved only in this browser."} />
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center md:flex">
          <div className="flex items-center gap-0.5 rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-raised,#FFFFFF)] p-0.5 shadow-[inset_0_0_0_1px_rgba(47,79,216,0.04)]">
            <button type="button" className="ask-field border-0 shadow-none" onClick={openAsk}>
              Ask anything ⌘K
            </button>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg-2,#3F465C)] hover:bg-[color:var(--cobalt-haze,#E8ECFA)] hover:text-[color:var(--cobalt,#2F4FD8)]"
              onClick={toggleTheme}
              aria-label={night ? "Switch to day" : "Switch to night"}
              title={night ? "Day" : "Night"}
            >
              {night ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 md:hidden">
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--line,#E1E5EF)] text-[color:var(--fg-2,#3F465C)]"
            onClick={toggleTheme}
            aria-label={night ? "Switch to day" : "Switch to night"}
          >
            {night ? <MoonIcon /> : <SunIcon />}
          </button>
          <button type="button" className="text-sm text-fg" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            Menu
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-1 border-t border-line px-5 py-3 md:hidden">
          {SECTIONS.map((item) => (
            <Link key={item.id} href={item.href} className="block py-1 text-sm text-fg" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <button type="button" className="block py-1 text-sm text-fg" onClick={openAsk}>
            Ask anything ⌘K
          </button>
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
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
    </svg>
  );
}
