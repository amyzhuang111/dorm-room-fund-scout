"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import type { ProjectTableRow } from "@/lib/domain/founder-table";
import { founderProjectRows } from "@/lib/domain/founder-view";

const FIRST_PAINT = 150;

export function FoundersDesk({
  campusId,
  campusLocked = false,
  initialCount,
  initialRows = null,
  allowedFounderIds,
}: {
  campusId?: string;
  campusLocked?: boolean;
  /** SSR count so the masthead does not flash empty. */
  initialCount?: number;
  /** First page, already rendered by the server. The full file replaces it. */
  initialRows?: ProjectTableRow[] | null;
  allowedFounderIds?: string[];
}) {
  const seeded = initialRows && initialRows.length ? initialRows.slice(0, FIRST_PAINT) : null;
  const [rows, setRows] = useState<ProjectTableRow[] | null>(seeded);
  const [error, setError] = useState<string | null>(null);
  void initialCount;

  useEffect(() => {
    let cancel = false;
    const fromApi = async () => {
      const qs = campusId ? `?campus=${encodeURIComponent(campusId)}` : "";
      const res = await fetch(`/api/founder-table${qs}`);
      if (!res.ok) throw new Error(`founder-table ${res.status}`);
      return (await res.json()) as { founderCount: number; rows: ProjectTableRow[] };
    };
    const fromStatic = async () => {
      const res = await fetch("/data/founder-table.json");
      if (!res.ok) return null;
      const data = (await res.json()) as { founderCount: number; rows: ProjectTableRow[] };
      if (!campusId) return data;
      const tagged = data.rows.length === 0 || Array.isArray(data.rows[0]?.campusIds);
      if (!tagged) return null;
      return { ...data, rows: data.rows.filter((row) => row.campusIds.includes(campusId)) };
    };
    void fromStatic().then((data) => data ?? fromApi())
      .then((data) => {
        if (cancel) return;
        setRows(founderProjectRows(data.rows, allowedFounderIds));
      })
      .catch((err) => {
        if (cancel) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancel = true;
    };
  }, [campusId, allowedFounderIds]);

  return (
    <div data-founders-desk="" data-founders-loaded={rows?.length ? "1" : "0"}>
      <div className="mt-3 sm:mt-6">
        {error && !rows ? <p className="text-[14px] text-[color:var(--ember,#D96B1C)]">Could not load the founder table.</p> : null}
        {!rows && !error ? (
          <p className="text-[14px] text-fg-3" data-founders-loading="">
            Loading founders…
          </p>
        ) : null}
        {rows ? <DataTable rows={rows} campusLocked={campusLocked} /> : null}
      </div>
    </div>
  );
}
