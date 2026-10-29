"use client";

import { useSyncExternalStore } from "react";

const KEY = "campus-scout-campus-shortlist";
const EVENT = "campus-scout-shortlist";

function readOn(id: string): boolean {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
    return ids.includes(id);
  } catch {
    return false;
  }
}

export function ShortlistCampusButton({ id }: { id: string }) {
  const on = useSyncExternalStore(
    (notify) => {
      const onChange = () => notify();
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => readOn(id),
    () => false,
  );

  function toggle() {
    const ids = JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <button type="button" onClick={toggle} className={`inline-flex h-9 items-center rounded px-3 text-[14px] font-semibold ${on ? "border border-link bg-transparent text-fg" : "bg-ember text-accent-foreground"}`}>
      {on ? "Campus shortlisted" : "Shortlist campus"}
    </button>
  );
}
