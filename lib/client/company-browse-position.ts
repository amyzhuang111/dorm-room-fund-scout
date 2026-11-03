"use client";

import { useEffect, type RefObject } from "react";
import { companyBrowsePath } from "@/lib/ui/company-browse-path";

const KEY = "campus-scout-company-return-v1";
type BrowsePosition = { href: string; companyId: string; offset: number; y: number; savedAt: number; pending: boolean };
function read(): BrowsePosition | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as BrowsePosition | null;
    if (!value || !companyBrowsePath(value.href) || typeof value.companyId !== "string" || !Number.isFinite(value.offset) || !Number.isFinite(value.y) || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > 86400000) return null;
    return value;
  } catch { return null; }
}

export function rememberCompanyBrowse(href: string, companyId: string) {
  if (location.pathname !== "/companies" || !companyBrowsePath(href)) return;
  const row = document.getElementById(`company-row-${companyId}`);
  try { sessionStorage.setItem(KEY, JSON.stringify({ href, companyId, offset: row?.getBoundingClientRect().top ?? 100, y: scrollY, savedAt: Date.now(), pending: true })); } catch { /* URL context still works without browser storage. */ }
}

export function requestCompanyBrowseRestore(href: string) {
  const position = read();
  if (position?.href === href) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ ...position, pending: true })); } catch { /* Keep navigation usable. */ }
  }
}

export function useCompanyBrowseRestore(href: string, ready: boolean, root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!ready || location.pathname !== "/companies") return;
    const position = read();
    if (!position?.pending || position.href !== href) return;
    const row = document.getElementById(`company-row-${position.companyId}`);
    if (!row) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ ...position, pending: false })); } catch { /* Restore this visit anyway. */ }
    let frame = 0;
    const align = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        window.scrollTo({ top: Math.max(0, row.getBoundingClientRect().top + scrollY - position.offset), behavior: "instant" });
      });
    };
    const observer = new ResizeObserver(align);
    if (root.current) observer.observe(root.current);
    const stop = () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("wheel", stop); window.removeEventListener("touchstart", stop); window.removeEventListener("keydown", stop); };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    row.querySelector<HTMLAnchorElement>("[data-company-record-link]")?.focus({ preventScroll: true });
    align();
    const timer = window.setTimeout(stop, 1800);
    return () => { clearTimeout(timer); stop(); };
  }, [href, ready, root]);
}
