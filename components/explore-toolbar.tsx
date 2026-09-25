import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import { sectorLabel } from "@/lib/domain/sectors";

const VIEWS = ["globe", "network", "table"] as const;

export function ExploreToolbar({
  basePath,
  current,
  resultCount,
  resultLabel,
  searchPlaceholder = "Search companies, founders…",
  showViewSwitch = true,
}: {
  basePath: string;
  current: Record<string, string | undefined>;
  resultCount: number;
  resultLabel: string;
  searchPlaceholder?: string;
  showViewSwitch?: boolean;
}) {
  const view = VIEWS.find((v) => v === current.view) ?? "globe";

  const activeFilters: { key: string; label: string }[] = [];
  if (current.university) activeFilters.push({ key: "university", label: `Campus` });
  if (current.queue) activeFilters.push({ key: "queue", label: `View: ${current.queue.replace(/_/g, " ")}` });
  if (current.sector) activeFilters.push({ key: "sector", label: sectorLabel(current.sector) });
  if (current.q) activeFilters.push({ key: "q", label: `Search: "${current.q}"` });
  if (current.feedback) activeFilters.push({ key: "feedback", label: current.feedback === "hidden" ? "Hidden" : current.feedback === "liked" ? "Liked" : "Passed" });

  return (
    <div className="border-b border-border-c px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={basePath} method="get" className="flex-1 min-w-[200px]">
          {Object.entries(current)
            .filter(([k, v]) => k !== "q" && v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <input
            type="search"
            name="q"
            defaultValue={current.q ?? ""}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-border-c bg-surface px-3 py-1.5 text-sm placeholder:text-muted"
          />
        </form>

        <div className="flex shrink-0 items-center gap-1 rounded-md border border-border-c p-0.5">
          <Link
            href={buildHref("/startup/discover", current, {})}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${basePath.startsWith("/startup") ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2"}`}
          >
            Companies
          </Link>
          <Link
            href={buildHref("/founder/discover", { university: current.university, q: current.q }, {})}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-2"
          >
            Founders
          </Link>
        </div>

        {showViewSwitch && (
          <div className="flex shrink-0 items-center gap-1 rounded-md border border-border-c p-0.5">
            {VIEWS.map((v) => (
              <Link
                key={v}
                href={buildHref(basePath, current, { view: v })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${view === v ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-2"}`}
              >
                {v}
              </Link>
            ))}
          </div>
        )}

        <Link href="/sources?from=startup" className="shrink-0 rounded-md border border-border-c px-2.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground">
          Scan sources
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
          {resultCount} {resultLabel}
        </span>
        {showViewSwitch && (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            Sort
            <Link href={buildHref(basePath, current, { sort: null })} className={!current.sort || current.sort === "name" ? "text-accent" : "hover:text-foreground"}>
              name
            </Link>
            <Link href={buildHref(basePath, current, { sort: "priority" })} className={current.sort === "priority" ? "text-accent" : "hover:text-foreground"}>
              research priority
            </Link>
          </span>
        )}
        {activeFilters.map((f) => (
          <Link
            key={f.key}
            href={buildHref(basePath, current, { [f.key]: null })}
            className="inline-flex items-center gap-1 rounded-full border border-border-c bg-surface-2 px-2 py-0.5 text-[11px] text-muted hover:text-foreground"
          >
            {f.label} ✕
          </Link>
        ))}
        {activeFilters.length > 0 && (
          <Link href={basePath} className="text-[11px] text-accent underline">
            Clear filters
          </Link>
        )}
      </div>
    </div>
  );
}
