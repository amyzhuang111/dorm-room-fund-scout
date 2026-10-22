"use client";

import { useEffect, useState } from "react";

const KEY = "campus-scout-campus-shortlist";

export function ShortlistCampusButton({ id }: { id: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      const ids = JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
      setOn(ids.includes(id));
    } catch {
      setOn(false);
    }
  }, [id]);

  function toggle() {
    const ids = JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    localStorage.setItem(KEY, JSON.stringify(next));
    setOn(next.includes(id));
  }

  return (
    <button type="button" onClick={toggle} className="h-8 rounded border border-line bg-raised px-3 text-[14px] font-medium text-fg">
      {on ? "Campus shortlisted" : "Shortlist campus"}
    </button>
  );
}
