"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";

const FOUNDER_NAV = [
  { href: "/founder/discover", label: "Discover" },
  { href: "/founder/shortlist", label: "Shortlist" },
  { href: "/signals?from=founder", label: "Signals" },
  { href: "/founder/network", label: "Network" },
  { href: "/sources?from=founder", label: "Sources" },
];

const STARTUP_NAV = [
  { href: "/startup/discover", label: "Discover" },
  { href: "/startup/shortlist", label: "Shortlist" },
  { href: "/startup/verification", label: "Verification" },
  { href: "/signals?from=startup", label: "Signals" },
  { href: "/startup/pipeline", label: "Pipeline" },
  { href: "/sources?from=startup", label: "Sources" },
];

const UTILITY_NAV = [
  { href: "/methodology", label: "Methodology" },
  { href: "/settings", label: "Settings" },
];

function currentProduct(pathname: string, fromParam: string | null): "founder" | "startup" {
  if (pathname.startsWith("/founder")) return "founder";
  if (pathname.startsWith("/startup")) return "startup";
  if (fromParam === "founder" || fromParam === "startup") return fromParam;
  return "startup";
}

export function TopNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const product = currentProduct(pathname, searchParams.get("from"));
  const nav = product === "founder" ? FOUNDER_NAV : STARTUP_NAV;

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
      <div className="flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6 overflow-x-auto">
          <details className="relative shrink-0">
            <summary
              onClick={() => track("campus_scout_click")}
              className="list-none cursor-pointer select-none text-sm font-semibold tracking-tight text-foreground"
            >
              Campus Scout <span className="text-muted">▾</span>
            </summary>
            <div className="absolute left-0 z-10 mt-1 w-44 rounded-md border border-border-c bg-surface p-1 shadow-lg">
              <Link
                href="/founder/discover"
                className={`block rounded-md px-2.5 py-1.5 text-sm ${product === "founder" ? "font-medium text-accent" : "text-foreground hover:bg-surface-2"}`}
              >
                Founder Scout
              </Link>
              <Link
                href="/startup/discover"
                className={`block rounded-md px-2.5 py-1.5 text-sm ${product === "startup" ? "font-medium text-accent" : "text-foreground hover:bg-surface-2"}`}
              >
                Startup Scout
              </Link>
            </div>
          </details>
          <nav className="flex items-center gap-1">
            {nav.map((item) => {
              const itemPath = item.href.split("?")[0];
              const active = pathname === itemPath || (itemPath !== "/signals" && itemPath !== "/sources" && pathname.startsWith(itemPath));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <details className="relative shrink-0">
          <summary className="list-none rounded-md px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-foreground cursor-pointer select-none">
            More ⋯
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-border-c bg-surface p-1 shadow-lg">
            {UTILITY_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="block rounded-md px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
