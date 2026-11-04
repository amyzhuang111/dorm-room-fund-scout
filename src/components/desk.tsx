"use client";

import { useMemo, useState } from "react";
import { Chrome } from "@/components/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  campuses,
  FILE_AS_OF,
  type Campus,
  type Coverage,
} from "@/data/campuses";
import {
  coverageLabel,
  founderTotal,
  monitoredTotal,
  outcomeLabel,
  rankAll,
  scanAll,
  type RankRecord,
  type ScanRecord,
} from "@/lib/desk";

type FilterId =
  | "all"
  | "not_scanned"
  | "up_to_date"
  | "opened"
  | "unranked";

const filters: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "not_scanned", label: "Was not scanned" },
  { id: "opened", label: "Scanned this pass" },
  { id: "up_to_date", label: "Already current" },
  { id: "unranked", label: "No PitchBook UG rank" },
];

function indexById<T extends { id: string }>(rows: T[]) {
  return Object.fromEntries(rows.map((row) => [row.id, row])) as Record<
    string,
    T
  >;
}

const initialScans = indexById(scanAll());
const initialRanks = indexById(rankAll());
const topRankedId =
  Object.values(initialRanks).find((row) => row.deskRank === 1)?.id ??
  campuses[0]?.id ??
  "";

function matchesFilter(
  campus: Campus,
  scan: ScanRecord | undefined,
  filter: FilterId,
) {
  if (filter === "all") return true;
  if (filter === "opened") return scan?.outcome === "opened";
  if (filter === "unranked") return campus.undergrad == null;
  if (filter === "up_to_date") return campus.coverage !== "not_scanned";
  return campus.coverage === filter;
}

function statusClass(coverage: Coverage, scanned: boolean) {
  if (coverage === "not_scanned") {
    return scanned ? "text-[#2f4fd8]" : "text-muted-foreground";
  }
  return "text-emerald-700";
}

export function Desk() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [selectedId, setSelectedId] = useState(topRankedId);
  const [railOpen, setRailOpen] = useState(false);
  const [scans, setScans] = useState<Record<string, ScanRecord> | null>(
    initialScans,
  );
  const [ranks, setRanks] = useState<Record<string, RankRecord> | null>(
    initialRanks,
  );
  const [phase, setPhase] = useState<"idle" | "scanning" | "ranking">("idle");
  const [progress, setProgress] = useState<{ done: number; name: string } | null>(
    null,
  );
  const [reranAt, setReranAt] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const rankedRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = campuses.filter((campus) => {
      if (!matchesFilter(campus, scans?.[campus.id], filter)) return false;
      if (!needle) return true;
      return (
        campus.name.toLowerCase().includes(needle) ||
        campus.shortName.toLowerCase().includes(needle) ||
        (campus.country ?? "").toLowerCase().includes(needle)
      );
    });
    rows.sort((a, b) => {
      const rankA = ranks?.[a.id]?.deskRank;
      const rankB = ranks?.[b.id]?.deskRank;
      if (rankA != null && rankB != null) return rankA - rankB;
      if (rankA != null) return -1;
      if (rankB != null) return 1;
      return a.shortName.localeCompare(b.shortName);
    });
    return rows;
  }, [filter, query, ranks, scans]);

  const selected = campuses.find((campus) => campus.id === selectedId) ?? null;
  const selectedScan = selected ? scans?.[selected.id] : undefined;
  const selectedRank = selected ? ranks?.[selected.id] : undefined;

  const scanCounts = useMemo(() => {
    const values = scans ? Object.values(scans) : [];
    return {
      confirmed: values.filter((row) => row.outcome === "confirmed").length,
      opened: values.filter((row) => row.outcome === "opened").length,
    };
  }, [scans]);

  async function replay(which: "scan" | "rank" | "both") {
    setRunError(null);
    setPhase("idle");
    setFilter("all");
    try {
      if (which === "scan" || which === "both") {
        setPhase("scanning");
        setScans(null);
        const next: Record<string, ScanRecord> = {};
        for (let i = 0; i < campuses.length; i += 5) {
          const slice = campuses.slice(i, i + 5);
          for (const campus of slice) {
            const record = scanAll([campus])[0];
            if (!record) throw new Error(`Scan missed ${campus.name}.`);
            next[campus.id] = record;
          }
          setScans({ ...next });
          setProgress({
            done: Math.min(i + slice.length, campuses.length),
            name: slice[slice.length - 1]?.shortName ?? "",
          });
          await new Promise((resolve) => setTimeout(resolve, 24));
        }
      }
      if (which === "rank" || which === "both") {
        setPhase("ranking");
        setRanks(null);
        const ordered = rankAll();
        const next: Record<string, RankRecord> = {};
        for (let i = 0; i < ordered.length; i += 8) {
          const slice = ordered.slice(i, i + 8);
          for (const record of slice) next[record.id] = record;
          setRanks({ ...next });
          const campus = campuses.find(
            (item) => item.id === slice[slice.length - 1]?.id,
          );
          setProgress({
            done: Math.min(i + slice.length, ordered.length),
            name: campus?.shortName ?? "",
          });
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
      }
      setReranAt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date()),
      );
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The pass failed.");
    } finally {
      setPhase("idle");
      setProgress(null);
    }
  }

  function showFile() {
    setScans(null);
    setRanks(null);
    setReranAt(null);
    setRunError(null);
    setFilter("not_scanned");
  }

  const busy = phase !== "idle";

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#16181d]">
      <Chrome active="work" />

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <button
          type="button"
          className="flex items-center justify-between border-b border-[#e6e8ef] px-4 py-2.5 text-sm sm:hidden"
          aria-expanded={railOpen}
          onClick={() => setRailOpen((open) => !open)}
        >
          <span className="text-xs font-medium tracking-wide text-[#5c6370] uppercase">
            Universities
          </span>
          <span className="text-xs text-[#5c6370]">
            {railOpen ? "Hide" : "Show"}
          </span>
        </button>

        <aside
          className={`${railOpen ? "block" : "hidden"} w-full shrink-0 border-[#e6e8ef] sm:block sm:w-[260px] sm:border-r`}
        >
          <div className="px-3 pt-3 pb-2">
            <div className="text-[11px] font-medium tracking-wide text-[#5c6370] uppercase">
              Universities
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[#5c6370]">
              {founderTotal.toLocaleString("en-US")} founders · {monitoredTotal}{" "}
              of {campuses.length} monitored on the {FILE_AS_OF} file
            </p>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search campuses"
              aria-label="Search campuses"
              className="mt-2 h-8 bg-white text-sm"
            />
          </div>
          <ul className="max-h-[40vh] overflow-y-auto px-2 pb-3 sm:max-h-[calc(100vh-8.5rem)]">
            <li>
              <button
                type="button"
                onClick={() => {
                  setSelectedId("");
                  setFilter("all");
                  setRailOpen(false);
                }}
                className={`mb-0.5 flex w-full rounded-md px-2 py-1.5 text-left text-sm ${
                  filter === "all" && !selectedId
                    ? "bg-[#eef1ff] font-medium"
                    : "hover:bg-[#f6f7fb]"
                }`}
              >
                All campuses
              </button>
            </li>
            {campuses.map((campus) => {
              const scan = scans?.[campus.id];
              const active = campus.id === selected?.id && selectedId !== "";
              const label = scan
                ? outcomeLabel(scan.outcome)
                : coverageLabel(campus.coverage);
              return (
                <li key={campus.id}>
                  <button
                    type="button"
                    title={campus.name}
                    onClick={() => {
                      setSelectedId(campus.id);
                      setRailOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[#f6f7fb] ${
                      active ? "bg-[#eef1ff]" : ""
                    }`}
                  >
                    <span className="truncate">{campus.shortName}</span>
                    <span
                      className={`flex shrink-0 items-center gap-1.5 text-[10px] ${statusClass(campus.coverage, Boolean(scan))}`}
                    >
                      <span>{label}</span>
                      <span className="tabular-nums text-[#5c6370]">
                        {campus.founderCount}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => replay("scan")}
              className="rounded-full bg-[#2f4fd8] text-white hover:bg-[#2f4fd8]/90"
            >
              Scan all campuses
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => replay("rank")}
              className="rounded-full bg-[#2f4fd8] text-white hover:bg-[#2f4fd8]/90"
            >
              Rank all
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => replay("both")}
            >
              Run both again
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={showFile}
            >
              Show the {FILE_AS_OF} file
            </Button>
          </div>

          <h1 className="mt-4 text-lg font-semibold">Scan and rank</h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[#5c6370]">
            {campuses.length} campuses from the current Campus Scout file. Scan
            walks every campus on that file. Rank places every campus on the
            PitchBook 2026 undergraduate list, then the graduate list, then the
            MBA list, then founders already on file. PitchBook place stays fixed
            when a campus is scanned.
          </p>
          <p className="mt-1 text-xs text-[#5c6370]">
            {scans
              ? `${scanCounts.opened} opened from Not scanned · ${scanCounts.confirmed} confirmed current · ${ranks ? `${Object.keys(ranks).length} ranked` : "rank not run yet"}`
              : `The ${FILE_AS_OF} file is showing. Scan and rank are ready.`}{" "}
            {reranAt
              ? `Re-ran at ${reranAt}.`
              : scans
                ? `Loaded from the ${FILE_AS_OF} file.`
                : null}
          </p>

          {progress ? (
            <p className="mt-2 text-sm text-[#2f4fd8]" role="status">
              {phase === "scanning" ? "Scanning" : "Ranking"} {progress.done} of{" "}
              {campuses.length} · {progress.name}
            </p>
          ) : null}
          {runError ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {runError}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  filter === item.id
                    ? "border-[#2f4fd8] bg-[#2f4fd8] text-white"
                    : "border-[#e6e8ef] bg-white text-[#16181d] hover:bg-[#f6f7fb]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {selected ? (
            <section className="mt-4 rounded-lg border border-[#e6e8ef] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">{selected.name}</h2>
                <span className="text-xs text-[#5c6370]">
                  {selected.country ?? "Country not on file"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline">
                  File · {coverageLabel(selected.coverage)}
                </Badge>
                <Badge variant="outline">
                  {selectedScan
                    ? `Scan · ${outcomeLabel(selectedScan.outcome)}`
                    : "Scan · not run"}
                </Badge>
                <Badge variant="outline">
                  {selectedRank
                    ? `Desk #${selectedRank.deskRank} · ${selectedRank.listLabel}`
                    : "Rank · not run"}
                </Badge>
                <Badge variant="secondary">
                  {selected.founderCount.toLocaleString("en-US")} founders on
                  file
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-5">
                {selectedScan?.note ??
                  `${coverageLabel(selected.coverage)} on the ${FILE_AS_OF} file. ${selected.sourcesConfigured} sources configured.`}
              </p>
              <p className="mt-1 text-sm leading-5 text-[#5c6370]">
                {selectedRank?.reason ??
                  "Rank all assigns a desk place to every campus."}
              </p>
            </section>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="text-[11px] tracking-wide text-[#5c6370] uppercase">
                <tr className="border-b border-[#e6e8ef]">
                  <th className="py-2 pr-3 font-medium">Desk</th>
                  <th className="py-2 pr-3 font-medium">Campus</th>
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium">Scan</th>
                  <th className="py-2 pr-3 font-medium">Founders</th>
                  <th className="py-2 pr-3 font-medium">List</th>
                  <th className="py-2 font-medium">Companies</th>
                </tr>
              </thead>
              <tbody>
                {rankedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-sm text-[#5c6370]">
                      No campus matches.
                    </td>
                  </tr>
                ) : (
                  rankedRows.map((campus) => {
                    const scan = scans?.[campus.id];
                    const rank = ranks?.[campus.id];
                    const active = campus.id === selected?.id;
                    return (
                      <tr
                        key={campus.id}
                        onClick={() => setSelectedId(campus.id)}
                        className={`cursor-pointer border-b border-[#f0f2f6] ${
                          active ? "bg-[#f7f8ff]" : "hover:bg-[#fafbfe]"
                        }`}
                      >
                        <td className="py-2 pr-3 tabular-nums">
                          {rank ? String(rank.deskRank).padStart(2, "0") : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{campus.shortName}</div>
                          <div className="text-xs text-[#5c6370]">
                            {campus.country ?? "—"}
                          </div>
                        </td>
                        <td
                          className={`py-2 pr-3 text-xs ${statusClass(campus.coverage, false)}`}
                        >
                          {coverageLabel(campus.coverage)}
                        </td>
                        <td
                          className={`py-2 pr-3 text-xs ${scan ? statusClass(campus.coverage, true) : "text-[#5c6370]"}`}
                        >
                          {scan ? outcomeLabel(scan.outcome) : "—"}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {campus.founderCount.toLocaleString("en-US")}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {rank?.listLabel ?? "—"}
                        </td>
                        <td className="py-2 tabular-nums">
                          {campus.companyCount.toLocaleString("en-US")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
