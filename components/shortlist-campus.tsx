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
    <button type="button" onClick={toggle} className={`inline-flex h-12 items-center rounded px-5 text-[16px] font-semibold ${on ? "border border-ember bg-transparent text-ember" : "bg-ember text-[#0b0e17]"}`}>
      {on ? "Campus shortlisted" : "Shortlist campus"}
    </button>
  );
}
