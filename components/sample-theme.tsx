"use client";

import { useEffect } from "react";

/** Keep the sample product on the Halflight night palette (globe + browse + company). */
export function SampleTheme() {
  useEffect(() => {
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "night";
    window.dispatchEvent(new Event("campus-scout-theme"));
    return () => {
      const stored = localStorage.getItem("campus-scout-theme");
      document.documentElement.dataset.theme = stored === "day" ? "day" : prev === "day" ? "day" : "night";
      window.dispatchEvent(new Event("campus-scout-theme"));
    };
  }, []);
  return null;
}
