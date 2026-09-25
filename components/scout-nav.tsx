"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { buildHref } from "@/lib/domain/url";

export type ScoutParams = Record<string, string | undefined>;

interface ScoutNavApi {
  basePath: string;
  current: ScoutParams;
  navigate: (overrides: Record<string, string | null>) => void;
}

const Ctx = createContext<ScoutNavApi | null>(null);

function applyOverrides(current: ScoutParams, overrides: Record<string, string | null>): ScoutParams {
  const next: ScoutParams = { ...current };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === "") delete next[key];
    else next[key] = value;
  }
  return next;
}

function paramsFromHref(href: string): ScoutParams {
  const url = new URL(href, "http://scout.local");
  const next: ScoutParams = {};
  url.searchParams.forEach((value, key) => {
    next[key] = value;
  });
  return next;
}

export function ScoutNav({
  basePath,
  initial,
  children,
}: {
  basePath: string;
  initial: ScoutParams;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState<ScoutParams>(initial);
  const navigate = useCallback(
    (overrides: Record<string, string | null>) => {
      setCurrent((prev) => {
        const next = applyOverrides(prev, overrides);
        const href = buildHref(basePath, next, {});
        window.history.replaceState(null, "", href);
        return next;
      });
    },
    [basePath]
  );

  useEffect(() => {
    const onPop = () => setCurrent(paramsFromHref(window.location.href));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return <Ctx.Provider value={{ basePath, current, navigate }}>{children}</Ctx.Provider>;
}

export function useScoutNav(): ScoutNavApi | null {
  return useContext(Ctx);
}

export function ScoutLink({
  href,
  className,
  children,
  title,
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
  "aria-expanded": ariaExpanded,
  role,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  "aria-expanded"?: boolean;
  role?: string;
}) {
  const nav = useScoutNav();
  const url = new URL(href, "http://scout.local");
  const samePage = nav != null && url.pathname === nav.basePath;

  if (!samePage) {
    return (
      <Link href={href} className={className} title={title} aria-label={ariaLabel} aria-pressed={ariaPressed} aria-expanded={ariaExpanded} role={role}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      className={className}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      role={role}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        const next = paramsFromHref(href);
        const overrides: Record<string, string | null> = {};
        for (const key of Object.keys(nav.current)) {
          if (!(key in next)) overrides[key] = null;
        }
        for (const [key, value] of Object.entries(next)) overrides[key] = value ?? null;
        nav.navigate(overrides);
      }}
    >
      {children}
    </a>
  );
}
