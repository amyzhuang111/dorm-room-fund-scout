"use client";

import { useState } from "react";

// On a phone the filter list is taller than the globe. Keep it behind a
// toggle so the map or table is the first thing on screen. Desktop layout
// is unchanged: this wrapper disappears and the sidebar stays a column.
export function CollapsibleSidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sm:contents">
      <button
        type="button"
        className="flex w-full items-center justify-between border-b border-border-c bg-surface px-3 py-2.5 text-sm text-foreground sm:hidden"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="ui-label text-foreground">Filters</span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      <div className={open ? "max-h-[70vh] overflow-y-auto sm:contents" : "hidden sm:contents"}>{children}</div>
    </div>
  );
}
