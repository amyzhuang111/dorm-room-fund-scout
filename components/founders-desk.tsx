"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import type { ProjectTableRow } from "@/lib/domain/founder-table";

export function FoundersDesk({
  campusId,
  campusLocked = false,
  initialCount,
}: {
  campusId?: string;
  campusLocked?: boolean;
  /** SSR count so the masthead does not flash empty. */
  initialCount?: number;
}) {
  const [rows, setRows] = useState<ProjectTableRow[] | null>(null);
  const [searchableCount, setSearchableCount] = useState<number | undefined>(initialCount);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    const qs = campusId ? `?campus=${encodeURIComponent(campusId)}` : "";
    void fetch(`/api/founder-table${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`founder-table ${res.status}`);
        return (await res.json()) as { founderCount: number; rows: ProjectTableRow[] };
      })
      .then((data) => {
        if (cancel) return;
        setRows(data.rows);
        setSearchableCount(data.founderCount);
      })
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancel = true;
    };
  }, [campusId]);

  return (
    <div data-founders-desk="" data-founders-loaded={rows ? "1" : "0"}>
      <div className="mt-2 sm:mt-3">
        {error ? <p className="text-[14px] text-[color:var(--ember,#D96B1C)]">Could not load the founder table.</p> : null}
        {!rows && !error ? (
          <p className="text-[14px] text-fg-3" data-founders-loading="">
            Loading founders…
          </p>
        ) : null}
        {rows ? (
          <DataTable
            rows={rows}
            campusLocked={campusLocked}
            searchableFounderCount={searchableCount}
          />
        ) : null}
      </div>
    </div>
  );
}
