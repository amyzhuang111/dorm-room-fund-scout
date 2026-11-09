"use client";

import { useEffect } from "react";

/** Keep the sample product on the cream field with the orange accent. */
export function SampleTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const prevTheme = root.dataset.theme;
    const prevSample = root.dataset.sample;
    root.dataset.theme = "day";
    root.dataset.sample = "halflight";
    window.dispatchEvent(new Event("campus-scout-theme"));
    return () => {
      if (prevSample) root.dataset.sample = prevSample;
      else delete root.dataset.sample;
      const stored = localStorage.getItem("campus-scout-theme");
      root.dataset.theme = stored === "night" ? "night" : prevTheme === "night" ? "night" : "day";
      window.dispatchEvent(new Event("campus-scout-theme"));
    };
  }, []);
  return null;
}
