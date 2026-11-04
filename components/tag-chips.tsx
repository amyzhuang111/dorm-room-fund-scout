"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

export type TagChip = {
  key: string;
  label: string;
  title?: string;
  tone?: "default" | "soft" | "ok" | "mono";
  attrs?: Record<string, string | undefined>;
};

const BASE =
  "inline-flex h-7 max-w-[14rem] shrink-0 items-center rounded-full border border-[color:var(--line,#E1E5EF)] px-2.5 text-[12px] leading-none text-[color:var(--fg,#0B0E17)]";
const TONE: Record<NonNullable<TagChip["tone"]>, string> = {
  default: "bg-[color:var(--bg,#FFFFFF)] font-medium",
  soft: "bg-[color:var(--bg-2,#F7F8FC)]",
  ok: "bg-[color:var(--bg,#FFFFFF)] text-[color:var(--ok,#1F7A4D)]",
  mono: "bg-[color:var(--bg,#FFFFFF)] font-mono tabular-nums text-[color:var(--fg-2,#3F465C)]",
};

/** One-row chip strip. Measures fit and shows +N for the rest (no mid-word clip). */
export function TagChips({
  chips,
  max = 8,
  className = "",
}: {
  chips: TagChip[];
  max?: number;
  className?: string;
}) {
  const prepared = useMemo(
    () =>
      chips
        .map((c) => ({ ...c, label: (c.label || "").replace(/\s+/g, " ").trim() }))
        .filter((c) => c.label),
    [chips],
  );
  const [open, setOpen] = useState(false);
  const [fit, setFit] = useState(prepared.length);
  const measureRef = useRef<HTMLSpanElement>(null);
  const rowRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (open || !prepared.length) {
      setFit(prepared.length);
      return;
    }
    const measure = measureRef.current;
    const row = rowRef.current;
    if (!measure || !row) return;

    const recompute = () => {
      // 2px safety against subpixel / parent border clip
      const avail = Math.max(0, row.clientWidth - 4);
      if (avail < 8) return;
      const kids = [...measure.querySelectorAll<HTMLElement>("[data-tag-chip-measure]")];
      const overflowEl = measure.querySelector<HTMLElement>("[data-tag-overflow-measure]");
      const overflowW = overflowEl ? overflowEl.getBoundingClientRect().width : 44;
      const gap = 6;
      const widths = kids.map((el) => el.getBoundingClientRect().width);
      const limit = Math.min(max, kids.length);
      let used = 0;
      let count = 0;
      for (let i = 0; i < limit; i++) {
        const w = widths[i];
        const nextUsed = used + (count > 0 ? gap : 0) + w;
        const moreAfter = kids.length - (i + 1) > 0;
        const total = moreAfter ? nextUsed + gap + overflowW : nextUsed;
        if (count === 0 && w > avail) {
          // Single chip wider than row: still show it (pill max-w + truncate)
          count = 1;
          break;
        }
        if (total > avail + 0.5) break;
        used = nextUsed;
        count++;
      }
      // Drop trailing chips until +N fits (guards rounding / max-hit cases)
      while (count > 1 && count < kids.length) {
        let u = 0;
        for (let i = 0; i < count; i++) u += (i > 0 ? gap : 0) + widths[i];
        if (u + gap + overflowW <= avail + 0.5) break;
        count--;
      }
      setFit(Math.max(1, Math.min(count || 1, kids.length)));
    };

    recompute();
    const ro = new ResizeObserver(() => recompute());
    ro.observe(row);
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) recompute();
      });
    });
    const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    if (fontsReady) {
      void fontsReady.then(() => {
        if (!cancelled) recompute();
      });
    }
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [prepared, open, max]);

  if (!prepared.length) return null;
  const shown = open ? prepared : prepared.slice(0, fit);
  const hidden = Math.max(0, prepared.length - shown.length);

  return (
    <>
      {/* Off-layout measure row: all chips + overflow probe */}
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] flex flex-nowrap items-center gap-1.5"
        data-tag-chips-measure=""
      >
        {prepared.map((chip) => (
          <span
            key={chip.key}
            className={`${BASE} ${TONE[chip.tone ?? "default"]}`}
            data-tag-chip-measure=""
          >
            {chip.label}
          </span>
        ))}
        <span className={`${BASE} bg-[color:var(--bg-2,#F7F8FC)] font-medium`} data-tag-overflow-measure="">
          +99
        </span>
      </span>

      <span
        ref={rowRef}
        className={`relative mt-2.5 flex w-full min-w-0 items-center gap-1.5 ${open ? "flex-wrap" : "flex-nowrap"} ${className}`}
        data-card-chips=""
        data-tag-chips=""
      >
        {shown.map((chip) => (
          <span
            key={chip.key}
            className={`${BASE} ${TONE[chip.tone ?? "default"]}`}
            title={chip.title ?? chip.label}
            data-tag-chip=""
            {...(chip.attrs ?? {})}
          >
            {chip.label}
          </span>
        ))}
        {!open && hidden > 0 ? (
          <button
            type="button"
            className={`${BASE} bg-[color:var(--bg-2,#F7F8FC)] font-medium text-[color:var(--fg-2,#3F465C)]`}
            data-tag-overflow=""
            aria-label={`Show ${hidden} more tags`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(true);
            }}
          >
            +{hidden}
          </button>
        ) : null}
      </span>
    </>
  );
}
