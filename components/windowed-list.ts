"use client";

import { useEffect, useRef, useState } from "react";

// Renders a window of a long list against the page scroll. The first paint
// is a short slice so a filter click does not build every row before the
// button updates; scrolling fills the rest in.
export function useWindowedItems<T>(items: T[], itemSize: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 24 });

  useEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const start = Math.max(0, Math.floor(-top / itemSize) - 8);
      const end = Math.min(items.length, start + Math.ceil(window.innerHeight / itemSize) + 16);
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items, itemSize]);

  const start = Math.min(range.start, items.length);
  const end = Math.min(Math.max(range.end, 24), items.length);
  return {
    anchorRef: ref,
    window: {
      slice: items.slice(start, end),
      padTop: start * itemSize,
      padBottom: Math.max(0, items.length - end) * itemSize,
    },
  };
}
