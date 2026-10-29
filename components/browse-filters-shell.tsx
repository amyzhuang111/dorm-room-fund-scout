"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Closed on mobile so the directory fold stays light; open on desktop. */
export function BrowseFiltersShell({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => {
      node.open = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return (
    <details ref={ref} className="browse-filters mt-2 sm:mt-3">
      <summary className="cursor-pointer text-[12px] font-medium text-fg-2 sm:hidden">{summary}</summary>
      <div className="mt-2 space-y-2 sm:space-y-2.5">{children}</div>
    </details>
  );
}
