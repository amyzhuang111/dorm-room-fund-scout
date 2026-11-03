"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";

const FOUNDER_NAV = [
  { href: "/founder/discover", label: "Discover" },
  { href: "/news", label: "News" },
  { href: "/hotspots?from=founder", label: "Hotspots" },
  { href: "/signals?from=founder", label: "Signals" },
  { href: "/founder/network", label: "Network" },
  { href: "/sources?from=founder", label: "Sources" },
  { href: "/founder/shortlist", label: "Shortlist" },
  { href: "/startup/pipeline", label: "Pipeline" },
];

const STARTUP_NAV = [
  { href: "/startup/discover", label: "Discover" },
  { href: "/news", label: "News" },
  { href: "/hotspots?from=startup", label: "Hotspots" },
  { href: "/startup/verification", label: "Verification" },
  { href: "/signals?from=startup", label: "Signals" },
  { href: "/sources?from=startup", label: "Sources" },
  { href: "/startup/shortlist", label: "Shortlist" },
  { href: "/startup/pipeline", label: "Pipeline" },
];

function currentProduct(pathname: string, fromParam: string | null): "founder" | "startup" {
  if (pathname.startsWith("/founder")) return "founder";
  if (pathname.startsWith("/startup")) return "startup";
  if (fromParam === "founder" || fromParam === "startup") return fromParam;
  if (pathname.startsWith("/hotspots")) return "founder";
  return "startup";
}

export function TopNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const product = currentProduct(pathname, searchParams.get("from"));
  const nav = product === "founder" ? FOUNDER_NAV : STARTUP_NAV;
  const onHome = pathname === "/";

  return (
    <div className="mx-auto flex max-w-[1100px] items-center gap-6 px-6 py-3">
      <div className="shrink-0">
        <Link href="/" className="wordmark">
          Campus Scout
        </Link>
        <details className="relative">
          <summary
            onClick={() => track("campus_scout_click")}
            className="wordmark-sub"
            aria-label="Switch scout"
          >
            {product === "founder" ? "Founder Scout" : "Startup Scout"}
          </summary>
          <div className="absolute left-0 z-20 mt-2 w-44 rounded-xl border border-border-c bg-surface p-1">
            <Link
              href="/founder/discover"
              className={`block rounded-lg px-2.5 py-1.5 text-sm ${product === "founder" ? "bg-accent-subtle font-medium text-foreground" : "text-foreground hover:bg-surface-2"}`}
            >
              Founder Scout
            </Link>
            <Link
              href="/startup/discover"
              className={`block rounded-lg px-2.5 py-1.5 text-sm ${product === "startup" ? "bg-accent-subtle font-medium text-foreground" : "text-foreground hover:bg-surface-2"}`}
            >
              Startup Scout
            </Link>
          </div>
        </details>
      </div>
      <nav className="flex min-w-0 flex-1 items-end gap-5 overflow-x-auto">
        <Link href="/" className={`nav-tab ${onHome ? "is-active" : ""}`}>
          Map
        </Link>
        {nav.map((item) => {
          const itemPath = item.href.split("?")[0];
          const active = !onHome && (pathname === itemPath || (itemPath !== "/signals" && itemPath !== "/sources" && pathname.startsWith(itemPath)));
          return (
            <Link key={item.href} href={item.href} className={`nav-tab ${active ? "is-active" : ""}`}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          className="search-pill"
          onClick={() => window.dispatchEvent(new Event("campus-scout-open-ask"))}
        >
          Search
          <kbd>⌘K</kbd>
        </button>
        <Link href="/methodology" className={`text-sm ${pathname === "/methodology" ? "text-foreground" : "text-muted hover:text-foreground"}`}>
          Methodology
        </Link>
        <Link href="/settings" className={`text-sm ${pathname === "/settings" ? "text-foreground" : "text-muted hover:text-foreground"}`}>
          Settings
        </Link>
      </div>
    </div>
  );
}
