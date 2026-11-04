"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import rows from "@/data/founder-links.json";
import {
  initials,
  safeHref,
  sourceLabel,
  type FounderRow,
} from "@/lib/links";
import { Chrome } from "@/components/chrome";

const founderRows = rows as FounderRow[];

const websiteCount = founderRows.filter((row) => safeHref(row.website)).length;
const profileCount = founderRows.reduce(
  (sum, row) => sum + row.people.filter((person) => safeHref(person.href)).length,
  0,
);
const peopleCount = founderRows.reduce((sum, row) => sum + row.people.length, 0);

const tiers = ["All", "S+", "S", "A", "B", "C", "Unranked"];

function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-[#2f4fd8] underline-offset-2 hover:underline"}
    >
      {children}
    </a>
  );
}

export function FoundersDesk() {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("All");
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return founderRows.filter((row) => {
      if (tier !== "All" && (row.tier ?? "Unranked") !== tier) return false;
      if (onlyLinked && !safeHref(row.website) && !row.people.some((person) => safeHref(person.href))) {
        return false;
      }
      if (!needle) return true;
      const people = row.people.map((person) => person.name).join(" ");
      return (
        row.name.toLowerCase().includes(needle) ||
        people.toLowerCase().includes(needle) ||
        (row.campus ?? "").toLowerCase().includes(needle) ||
        row.signal.toLowerCase().includes(needle)
      );
    });
  }, [onlyLinked, query, tier]);

  const selected = founderRows.find((row) => row.id === selectedId) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#16181d]">
      <Chrome active="founders" />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="min-w-0 flex-1 px-4 py-4 sm:px-6">
          <h1 className="text-2xl font-semibold">Founders</h1>
          <p className="mt-1 text-sm text-[#5c6370]">
            {founderRows.length.toLocaleString("en-US")} projects ·{" "}
            {peopleCount.toLocaleString("en-US")} people ·{" "}
            {websiteCount.toLocaleString("en-US")} company websites ·{" "}
            {profileCount.toLocaleString("en-US")} founder profiles
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company or founder"
              aria-label="Search company or founder"
              className="h-9 bg-white sm:max-w-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {tiers.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={tier === item}
                  onClick={() => setTier(item)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    tier === item
                      ? "border-[#2f4fd8] bg-[#2f4fd8] text-white"
                      : "border-[#e6e8ef] bg-white hover:bg-[#f6f7fb]"
                  }`}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={onlyLinked}
                onClick={() => setOnlyLinked((value) => !value)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  onlyLinked
                    ? "border-[#2f4fd8] bg-[#2f4fd8] text-white"
                    : "border-[#e6e8ef] bg-white hover:bg-[#f6f7fb]"
                }`}
              >
                Has a link
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="text-[11px] tracking-wide text-[#5c6370] uppercase">
                <tr className="border-b border-[#e6e8ef]">
                  <th className="py-2 pr-3 font-medium">Project</th>
                  <th className="py-2 pr-3 font-medium">Website</th>
                  <th className="py-2 pr-3 font-medium">Founders</th>
                  <th className="py-2 pr-3 font-medium">Tier</th>
                  <th className="py-2 pr-3 font-medium">Campus</th>
                  <th className="py-2 font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-sm text-[#5c6370]">
                      No project matches.
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => {
                    const website = safeHref(row.website);
                    const active = row.id === selectedId;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        className={`cursor-pointer border-b border-[#f0f2f6] ${
                          active ? "bg-[#f4f6ff]" : "hover:bg-[#fafbfe]"
                        }`}
                      >
                        <td className="py-2 pr-3 font-medium">
                          {website ? (
                            <ExternalLink href={website}>{row.name}</ExternalLink>
                          ) : (
                            row.name
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {website ? (
                            <ExternalLink href={website} className="text-xs text-[#2f4fd8] hover:underline">
                              Site
                            </ExternalLink>
                          ) : (
                            <span className="text-xs text-[#5c6370]">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex flex-col gap-0.5">
                            {row.people.length === 0 ? (
                              <span className="text-xs text-[#5c6370]">—</span>
                            ) : (
                              row.people.map((person) => {
                                const href = safeHref(person.href);
                                return href ? (
                                  <ExternalLink
                                    key={person.id}
                                    href={href}
                                    className="text-xs text-[#2f4fd8] hover:underline"
                                  >
                                    {person.name}
                                  </ExternalLink>
                                ) : (
                                  <span key={person.id} className="text-xs">
                                    {person.name}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#2f4fd8] text-[10px] font-semibold text-white">
                            {row.tier ?? "—"}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-[#5c6370]">
                          {row.campus ?? "—"}
                        </td>
                        <td className="max-w-md py-2 text-xs leading-4 text-[#3c4250]">
                          <span className="line-clamp-2">{row.signal || "—"}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>

        <aside className="w-full shrink-0 border-t border-[#e6e8ef] px-4 py-4 lg:w-[320px] lg:border-t-0 lg:border-l">
          {selected ? <Detail row={selected} onClose={() => setSelectedId(null)} /> : (
            <p className="text-sm text-[#5c6370]">
              Select a project to open its website and founder profiles.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Detail({ row, onClose }: { row: FounderRow; onClose: () => void }) {
  const website = safeHref(row.website);
  const source = safeHref(row.source?.url);
  return (
    <div>
      <button type="button" onClick={onClose} className="text-xs text-[#5c6370] hover:text-[#16181d]">
        Close
      </button>
      <h2 className="mt-2 text-lg font-semibold">
        {website ? <ExternalLink href={website}>{row.name}</ExternalLink> : row.name}
      </h2>
      <p className="text-sm text-[#5c6370]">{row.campus ?? "Campus not on record"}</p>
      {row.tierBasis ? (
        <p className="mt-2 text-sm">
          <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-[#2f4fd8] text-[10px] font-semibold text-white">
            {row.tier ?? "—"}
          </span>
          {row.tierBasis}
        </p>
      ) : null}
      {row.signal ? <p className="mt-3 text-sm leading-5">{row.signal}</p> : null}
      <div className="mt-4 space-y-2 text-sm">
        <p>
          {website ? (
            <ExternalLink href={website}>Company website</ExternalLink>
          ) : (
            <span className="text-[#5c6370]">No company website on file</span>
          )}
        </p>
        {source && source !== website ? (
          <p>
            <ExternalLink href={source}>{sourceLabel(row.source?.kind)} link</ExternalLink>
          </p>
        ) : null}
      </div>
      <ul className="mt-4 space-y-2">
        {row.people.map((person) => {
          const href = safeHref(person.href);
          return (
            <li key={person.id} className="flex items-center gap-2 text-sm">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#eef1ff] text-[10px] font-semibold text-[#2f4fd8]">
                {initials(person.name)}
              </span>
              {href ? (
                <ExternalLink href={href}>
                  {person.name}
                  {person.label ? <span className="text-[#5c6370]"> · {person.label}</span> : null}
                </ExternalLink>
              ) : (
                <span>
                  {person.name}
                  <span className="text-[#5c6370]"> · no profile link</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
