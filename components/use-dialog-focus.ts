"use client";
import { useEffect, type RefObject } from "react";

/** Keep keyboard focus inside an open modal and restore its launcher on close. */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter((node) => node.tabIndex >= 0 && node.getClientRects().length > 0);
    controls()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    dialog.addEventListener("keydown", keydown);
    return () => { dialog.removeEventListener("keydown", keydown); document.body.style.overflow = priorOverflow; previous?.focus(); };
  }, [open, ref, close]);
}
