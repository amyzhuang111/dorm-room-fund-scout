"use client";

import { useMemo, useState } from "react";
import { titleCaseTag } from "@/lib/display/tag-label";
import { WRAP_FULL } from "@/lib/display/ellipsis";

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

/** One-row chip strip with +N overflow. Title-cases labels. */
export function TagChips({
  chips,
  max = 5,
  className = "",
}: {
  chips: TagChip[];
  max?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const prepared = useMemo(
    () =>
      chips
        .map((c) => ({ ...c, label: titleCaseTag(c.label) }))
        .filter((c) => c.label),
    [chips],
  );
  if (!prepared.length) return null;
  const shown = open ? prepared : prepared.slice(0, max);
  const hidden = Math.max(0, prepared.length - shown.length);
  return (
    <span
      className={`mt-2.5 flex flex-nowrap items-center gap-1.5 overflow-hidden ${className}`}
      data-card-chips=""
      data-tag-chips=""
    >
      {shown.map((chip) => (
        <span
          key={chip.key}
          className={`${BASE} ${TONE[chip.tone ?? "default"]}`}
          title={chip.title ?? chip.label}
          {...(chip.attrs ?? {})}
        >
          <span className={WRAP_FULL}>{chip.label}</span>
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
  );
}
