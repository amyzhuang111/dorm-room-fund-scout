import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import { listUnverifiedCompanies, type UnverifiedCompany } from "@/lib/domain/unverified-companies";

const PAGE_SIZE = 40;
const TOP_CAMPUSES = 12;

const STATUS_LABEL: Record<string, string> = {
  current_student: "current student",
  recent_grad: "recent grad",
  older_alumni: "older alum",
};

function statusLabel(status: string | null): string {
  return (status && STATUS_LABEL[status]) || "status unknown";
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Switch between the vetted company list and the labeled unverified list. */
export function CompanySetToggle({ vetted, unverified, active }: { vetted: number; unverified: number; active: "vetted" | "unverified" }) {
  const base = "inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium";
  const on = "border-[color:var(--cobalt)] bg-[color:var(--cobalt)] text-white";
  const off = "border-[color:var(--line)] bg-white text-[color:var(--fg-2)] hover:border-[color:var(--cobalt)]";
  return (
    <nav aria-label="Company set" className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-2 px-3 pt-4 sm:px-6" data-company-set-toggle="">
      <Link href="/companies" aria-current={active === "vetted" ? "page" : undefined} className={`${base} ${active === "vetted" ? on : off}`}>
        Vetted · {vetted.toLocaleString("en-US")}
      </Link>
      <Link href="/companies?unverified=1" aria-current={active === "unverified" ? "page" : undefined} className={`${base} ${active === "unverified" ? on : off}`}>
        Unverified · {unverified.toLocaleString("en-US")}
      </Link>
      <span className="text-xs text-[color:var(--fg-3)]">Vetted counts never include unverified companies.</span>
    </nav>
  );
}

export function unverifiedTotal(): number {
  return listUnverifiedCompanies({ pageSize: 1 }).totalAll;
}

function CompanyRow({ c }: { c: UnverifiedCompany }) {
  const shown = c.campuses.slice(0, 3);
  return (
    <li className="rounded-lg border border-[color:var(--line)] bg-white px-4 py-3" data-unverified-company="">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/startup/${c.id}`} className="text-[15px] font-semibold text-[color:var(--fg)] hover:underline">
          {c.name}
        </Link>
        <span className="rounded-full border border-[color:var(--amber,#B7791F)] bg-[#FFF8EB] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8A5A00]">
          Unverified
        </span>
        {c.sector ? <span className="text-xs text-[color:var(--fg-3)]">{c.sector}</span> : null}
      </div>
      {shown.length > 0 ? (
        <p className="mt-1 text-xs text-[color:var(--fg-2)]">
          {shown.map((k) => k.name).join(" · ")}
          {c.campuses.length > shown.length ? ` · +${c.campuses.length - shown.length} more` : ""}
        </p>
      ) : null}
      {c.description ? <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-[color:var(--fg-2)]">{c.description}</p> : null}
      <p className="mt-1.5 text-xs text-[color:var(--fg-3)]">
        {c.people.length > 0 ? (
          <>
            {c.people.slice(0, 4).map((p, i) => (
              <span key={p.name}>
                {i > 0 ? " · " : ""}
                {p.name} ({statusLabel(p.status)})
              </span>
            ))}
            {c.people.length > 4 ? ` · +${c.people.length - 4} more` : ""}
          </>
        ) : (
          "No founder on record"
        )}
        {" · "}recency not confirmed
        {c.website ? (
          <>
            {" · "}
            <a href={c.website} target="_blank" rel="noreferrer" className="underline">
              {host(c.website)}
            </a>
          </>
        ) : null}
      </p>
    </li>
  );
}

export function UnverifiedCompaniesView({ sp }: { sp: Record<string, string | undefined> }) {
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const result = listUnverifiedCompanies({ campus: sp.campus, q: sp.q, page, pageSize: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const from = (current - 1) * PAGE_SIZE;
  const href = (over: Record<string, string | null>) => buildHref("/companies", sp, { unverified: "1", ...over });
  const chips = result.campusCounts.slice(0, TOP_CAMPUSES);
  const selected = sp.campus ? result.campusCounts.find((k) => k.id === sp.campus) : undefined;
  if (selected && !chips.some((k) => k.id === selected.id)) chips.push(selected);

  return (
    <div className="mx-auto max-w-[1100px] px-3 pb-12 pt-4 sm:px-6" data-unverified-view="">
      <h1 className="text-[28px] font-semibold tracking-tight text-[color:var(--fg)]">Unverified companies</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--fg-2)]">
        These companies are reported at a campus, but nobody has confirmed that their founders are current students or recent graduates.
        Treat every entry as a lead, not a finding. They are <strong>not</strong> included in the vetted counts anywhere on the site.
        Companies whose founders are known to have graduated before 2023 are not listed.
      </p>

      <form action="/companies" method="get" className="mt-4 flex flex-wrap items-center gap-2" role="search">
        <input type="hidden" name="unverified" value="1" />
        {sp.campus ? <input type="hidden" name="campus" value={sp.campus} /> : null}
        <label className="sr-only" htmlFor="unverified-q">
          Search unverified companies
        </label>
        <input
          id="unverified-q"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search name, description, founder"
          className="min-h-10 w-full max-w-sm rounded-md border border-[color:var(--line)] bg-white px-3 text-sm sm:w-80"
        />
        <button type="submit" className="min-h-10 rounded-md border border-[color:var(--line)] bg-white px-3 text-sm font-medium text-[color:var(--cobalt)]">
          Search
        </button>
        {sp.q || sp.campus ? (
          <Link href={href({ q: null, campus: null, page: null })} className="text-sm text-[color:var(--fg-2)] underline">
            Clear filters
          </Link>
        ) : null}
      </form>

      <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter by campus">
        {chips.map((k) => (
          <Link
            key={k.id}
            href={href({ campus: sp.campus === k.id ? null : k.id, page: null })}
            aria-pressed={sp.campus === k.id}
            className={`rounded-full border px-2.5 py-1 text-xs ${sp.campus === k.id ? "border-[color:var(--cobalt)] bg-[color:var(--cobalt)] text-white" : "border-[color:var(--line)] bg-white text-[color:var(--fg-2)] hover:border-[color:var(--cobalt)]"}`}
          >
            {k.name} · {k.count.toLocaleString("en-US")}
          </Link>
        ))}
      </div>

      <p className="mt-4 text-xs text-[color:var(--fg-3)]" role="status">
        {result.total === 0
          ? "No unverified companies match."
          : `Showing ${(from + 1).toLocaleString("en-US")}–${Math.min(result.total, from + PAGE_SIZE).toLocaleString("en-US")} of ${result.total.toLocaleString("en-US")}`}
        {result.total !== result.totalAll ? ` (filtered from ${result.totalAll.toLocaleString("en-US")})` : ""}
      </p>

      <ul className="mt-2 space-y-2">
        {result.rows.map((c) => (
          <CompanyRow key={c.id} c={c} />
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav aria-label="Unverified company pages" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {current > 1 ? (
            <Link href={href({ page: current - 1 <= 1 ? null : String(current - 1) })} className="text-[color:var(--cobalt)] underline">
              Previous
            </Link>
          ) : (
            <span className="text-[color:var(--fg-3)]">Previous</span>
          )}
          <span className="text-[color:var(--fg-3)]">
            Page {current} of {pageCount}
          </span>
          {current < pageCount ? (
            <Link href={href({ page: String(current + 1) })} className="text-[color:var(--cobalt)] underline">
              Next
            </Link>
          ) : (
            <span className="text-[color:var(--fg-3)]">Next</span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
