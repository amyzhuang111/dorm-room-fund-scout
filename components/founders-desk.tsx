"use client";

import { useEffect, useState } from "react";
import { FounderPeopleTable } from "@/components/founder-people-table";
import type { FounderTableRow } from "@/lib/domain/founder-table";

const FIRST_PAINT = 40;

export function FoundersDesk({
  campusId,
  campusLocked = false,
  initialCount,
  initialRows = null,
}: {
  campusId?: string;
  campusLocked?: boolean;
  initialCount?: number;
  initialRows?: FounderTableRow[] | null;
}) {
  const seeded = initialRows && initialRows.length ? initialRows.slice(0, FIRST_PAINT) : null;
  const [rows, setRows] = useState<FounderTableRow[] | null>(seeded);
  const [error, setError] = useState<string | null>(null);
  void initialCount;

  useEffect(() => {
    let cancel = false;
    const fromApi = async () => {
      const qs = campusId ? `?campus=${encodeURIComponent(campusId)}` : "";
      const res = await fetch(`/api/founder-table${qs}`);
      if (!res.ok) throw new Error(`founder-table ${res.status}`);
      return (await res.json()) as { founderCount: number; rows: FounderTableRow[] };
    };
    const fromStatic = async () => {
      const res = await fetch("/data/founder-table.json");
      if (!res.ok) return null;
      const data = (await res.json()) as { founderCount: number; rows: FounderTableRow[] };
      const first = data.rows[0] as (FounderTableRow & { people?: unknown }) | undefined;
      if (first && Array.isArray(first.people)) return null;
      if (!campusId) return data;
      const tagged = data.rows.length === 0 || Array.isArray(data.rows[0]?.campusIds);
      if (!tagged) return null;
      return { ...data, rows: data.rows.filter((row) => row.campusIds.includes(campusId)) };
    };
    void fromStatic()
      .then((data) => data ?? fromApi())
      .then((data) => {
        if (cancel) return;
        setRows(data.rows.map((row) => ({ ...row, affiliations: row.affiliations ?? [], leftSchool: row.leftSchool ?? false, companyClaimState: row.companyClaimState ?? null, companyClaimUrl: row.companyClaimUrl ?? null, companyClaimExcerpt: row.companyClaimExcerpt ?? null, presentEnrollment: row.presentEnrollment ?? "unknown", presentEnrollmentText: row.presentEnrollmentText ?? "" })));
      })
      .catch((err) => {
        if (cancel) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancel = true;
    };
  }, [campusId]);

  return (
    <div data-founders-desk="" data-founders-loaded={rows?.length ? "1" : "0"}>
      <div className="mt-3 sm:mt-6">
        {error && !rows ? <p className="text-[14px] text-[color:var(--ember,#D96B1C)]">Could not load the founder list.</p> : null}
        {!rows && !error ? (
          <p className="text-[14px] text-fg-3" data-founders-loading="">
            Loading founders…
          </p>
        ) : null}
        {rows ? <FounderPeopleTable rows={rows} campusLocked={campusLocked} /> : null}
      </div>
    </div>
  );
}
