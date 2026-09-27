"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";
const FOUNDER_NAV = [
  { href: "/founder/discover", label: "Discover" },
  { href: "/news", label: "News" },
  { href: "/hotspots?from=founder", label: "Hotspots" },
  { href: "/founder/shortlist", label: "Shortlist" },
  { href: "/startup/pipeline", label: "Pipeline" },
  { href: "/signals?from=founder", label: "Signals" },
  { href: "/founder/network", label: "Network" },
  { href: "/sources?from=founder", label: "Sources" },
];

const STARTUP_NAV = [
  { href: "/startup/discover", label: "Discover" },
  { href: "/news", label: "News" },
  { href: "/hotspots?from=startup", label: "Hotspots" },
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
  if (pathname.startsWith("/hotspots")) return "founder";
  return "startup";
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="ml-1 inline h-3 w-3 align-[-1px]">
      <rect x="3.25" y="7" width="9.5" height="6.25" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.25 7V5.1a2.75 2.75 0 0 1 5.5 0V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function TopNav({
  signedIn = false,
  email = null,
  signOutAction,
}: {
  signedIn?: boolean;
  email?: string | null;
  signOutAction?: () => Promise<void>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const product = currentProduct(pathname, searchParams.get("from"));
  const nav = product === "founder" ? FOUNDER_NAV : STARTUP_NAV;
  const onHome = pathname === "/";
  const networkView = onHome && searchParams.get("view") === "network";

  function setHomeView(view: "globe" | "network") {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "network") params.set("view", "network");
    else params.delete("view");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
      <div className="flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6 overflow-x-auto">
          <div className="flex shrink-0 items-center gap-1">
            <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
              Campus Scout
            </Link>
            <details className="relative">
            <summary
              onClick={() => track("campus_scout_click")}
              className="list-none cursor-pointer select-none px-1 text-sm text-muted"
              aria-label="Switch scout"
            >
              ▾
            </summary>
            <div className="absolute left-0 z-10 mt-1 w-44 rounded-md border border-border-c bg-surface p-1 shadow-lg">
              <Link
                href="/founder/discover"
                className={`block rounded-md px-2.5 py-1.5 text-sm ${product === "founder" ? "bg-accent-subtle font-medium text-foreground" : "text-foreground hover:bg-surface-2"}`}
              >
                Founder Scout
              </Link>
              <Link
                href="/startup/discover"
                className={`block rounded-md px-2.5 py-1.5 text-sm ${product === "startup" ? "bg-accent-subtle font-medium text-foreground" : "text-foreground hover:bg-surface-2"}`}
              >
                Startup Scout
              </Link>
            </div>
            </details>
          </div>
          {onHome && (
            <div className="flex shrink-0 rounded-md border border-black bg-white p-0.5 text-xs font-semibold text-black" role="group" aria-label="Homepage view">
              <button
                type="button"
                className={`rounded px-2.5 py-1 ${networkView ? "text-black" : "bg-black text-white"}`}
                aria-pressed={!networkView}
                onClick={() => setHomeView("globe")}
              >
                Globe
              </button>
              <button
                type="button"
                className={`rounded px-2.5 py-1 ${networkView ? "bg-black text-white" : "text-black"}`}
                aria-pressed={networkView}
                onClick={() => setHomeView("network")}
              >
                Network
              </button>
            </div>
          )}
          <nav className="flex items-center gap-1">
            {nav.map((item) => {
              const itemPath = item.href.split("?")[0];
              const active = pathname === itemPath || (itemPath !== "/signals" && itemPath !== "/sources" && pathname.startsWith(itemPath));
              const locked = !signedIn && (item.label === "Shortlist" || item.label === "Pipeline");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={locked ? `${item.label}, sign in required` : undefined}
                  title={locked ? "Sign in with your DRF email" : undefined}
                  className={`shrink-0 rounded-full px-3 py-1 text-sm ${active ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
                >
                  {item.label}
                  {locked ? <LockIcon /> : null}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        {signedIn ? (
          <>
            {email ? <span className="hidden max-w-[10rem] truncate text-xs font-medium text-black sm:inline">{email}</span> : null}
            {signOutAction ? (
              <form action={signOutAction}>
                <button type="submit" className="rounded-md border border-black bg-white px-2.5 py-1 text-xs font-semibold text-black">
                  Sign out
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <Link href="/signin" className="rounded-md border border-black bg-white px-2.5 py-1 text-xs font-semibold text-black">
            Sign in
          </Link>
        )}
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
    </div>
  );
}
