"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { buildHref } from "@/lib/domain/url";

// Design MD §4: "First visit on desktop: Globe ... Remember the user's
// last view afterward." Server Components can't read localStorage, so this
// tiny client-only helper does the two halves of that: on mount with no
// explicit `?view=` in the URL, redirect once to whatever view was last
// remembered for this basePath (skipped entirely if nothing's remembered
// yet, so first-ever visit still gets the real default); whenever the URL
// DOES carry an explicit view (the user picked one via ExploreToolbar),
// remember it for next time. Renders nothing — pure side effect.
export function ViewMemory({
  basePath,
  current,
  storageKey,
}: {
  basePath: string;
  current: Record<string, string | undefined>;
  storageKey: string;
}) {
  const router = useRouter();

  useEffect(() => {
    try {
      if (current.view) {
        localStorage.setItem(storageKey, current.view);
        return;
      }
      const remembered = localStorage.getItem(storageKey);
      if (remembered) {
        router.replace(buildHref(basePath, current, { view: remembered }));
      }
    } catch {
      // Private window / blocked storage — fall back to the real default silently.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.view]);

  return null;
}
