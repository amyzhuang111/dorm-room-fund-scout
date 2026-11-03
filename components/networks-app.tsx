"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CampusSeal } from "@/components/campus-seal";
import { NetworksGraph } from "@/components/networks-graph";
import { StartupCardSheet } from "@/components/startup-directory-card";
import type {
  FounderNetworksPage,
  NetworkKind,
  NetworkMember,
  NetworkSummary,
  SectorConcentration,
} from "@/lib/domain/founder-networks-model";

function loadPage(): Promise<FounderNetworksPage> {
  return fetch("/data/founder-networks-page.json").then((res) => {
    if (!res.ok) throw new Error("networks page missing");
    return res.json();
  });
}

const KIND_LABEL: Record<NetworkKind, string> = {
  accelerator: "Accelerator",
  program: "Program",
  lab: "Lab",
  investor: "Investor",
};

function pct(share: number): string {
  return `${Math.round(share * 100).toLocaleString("en-US")}%`;
}

function heat(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "transparent";
  const t = Math.sqrt(count / max);
  const light = [236, 239, 252];
  const dark = [60, 66, 212];
  const rgb = light.map((start, i) => Math.round(start + (dark[i] - start) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function inkFor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "var(--fg-3)";
  return count / max > 0.45 ? "#ffffff" : "var(--fg)";
}

export function NetworksApp() {
  const [data, setData] = useState<FounderNetworksPage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeNetwork, setActiveNetwork] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [concentrationOpen, setConcentrationOpen] = useState(true);
  const [mobileHubsOpen, setMobileHubsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPage()
      .then((page) => {
        if (cancelled) return;
        setData(page);
        setActiveNetwork((current) => current ?? page.topNetworks[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Networks data could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active: NetworkSummary | null = useMemo(
    () => data?.topNetworks.find((row) => row.id === activeNetwork) ?? null,
    [data, activeNetwork]
  );
  const members: NetworkMember[] = active && data ? data.membersByNetwork[active.id] ?? [] : [];

  let matrixMax = 0;
  if (data) {
    for (const row of data.matrix.rows) {
      for (const cell of row.cells) matrixMax = Math.max(matrixMax, cell.count);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-white px-5 py-10 text-sm text-[color:var(--fg-2)]" data-networks-page="">
        {loadError}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-white px-5 py-10 text-sm text-[color:var(--fg-3)]" data-networks-page="">
        Loading networks...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[color:var(--fg)]" data-networks-page="">
      <header className="border-b border-[color:var(--line)] bg-white" data-networks-hero="">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-4 py-3 sm:gap-2 sm:px-5 sm:py-5">
          <div className="flex items-center gap-2 text-[color:var(--cobalt)]">
            <CampusSeal label="CS" title="Campus Scout" size="sm" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] sm:text-xs">Campus Scout</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--fg)] sm:text-2xl">Campus founder networks</h1>
          <p className="max-w-3xl text-[13px] leading-snug text-[color:var(--fg-2)] sm:text-sm sm:leading-normal">
            A map of the programs and funds that already reach student founders across{" "}
            {data.corpusCompanies.toLocaleString("en-US")} companies. Open a hub to see who is on that path.
          </p>
          <p className="text-[11px] text-[color:var(--fg-3)] sm:text-xs">
            {data.totals.founderLinks.toLocaleString("en-US")} founder links · {data.totals.networks.toLocaleString("en-US")} networks ·{" "}
            {data.totals.companiesLinked.toLocaleString("en-US")} companies · {data.totals.foundersLinked.toLocaleString("en-US")} founders
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-3 sm:gap-8 sm:px-5 sm:py-6">
        <section aria-labelledby="graph-heading" className="order-1 overflow-hidden rounded-lg border border-[color:var(--line)] bg-white md:order-1">
          <div className="px-3 py-2 sm:px-4 sm:py-3">
            <h2 id="graph-heading" className="text-[15px] font-semibold tracking-tight">
              Network map
            </h2>
            <p className="mt-0.5 hidden text-[13px] text-[color:var(--fg-2)] sm:block">
              Founders are colored by campus. Hubs are programs and funds. Lines are real co-founder and membership ties. Hover a founder for the company and backers.
            </p>
            <p className="mt-0.5 text-[11px] text-[color:var(--fg-2)] sm:hidden">
              Campus colored founders and program hubs.
            </p>
            {/* Mobile fold: scrollable top-10 hubs with counts above the compact graph (n3 structure). */}
            <ol
              className="mt-2 max-h-[12.5rem] divide-y divide-[color:var(--line)] overflow-y-auto rounded border border-[color:var(--line)] md:hidden"
              data-networks-mobile-top-fold=""
            >
              {data.topNetworks.slice(0, 10).map((row, index) => (
                <li key={`mobile-top-${row.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1 text-left"
                    onClick={() => setActiveNetwork(row.id)}
                  >
                    <span className="w-4 shrink-0 text-[10px] tabular-nums text-[color:var(--fg-3)]">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[color:var(--fg)]">{row.label}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--fg-2)]">
                      {row.founderCount.toLocaleString("en-US")}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <NetworksGraph
            investorHubs={data.investorHubs}
            onSelectCompany={(id) => setCompanyId(id)}
            onSelectNetwork={(id) => {
              setActiveNetwork(id);
            }}
          />
        </section>

        <section aria-labelledby="top-networks-heading" className="order-2 md:order-2">
          <div className="mb-2 sm:mb-3">
            <h2 id="top-networks-heading" className="text-base font-semibold tracking-tight sm:text-lg">
              Top networks
            </h2>
            <p className="text-[12px] text-[color:var(--fg-2)] sm:text-sm">Where campus founders already concentrate, ranked by linked founders.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-4">
            <ol
              className="divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)] bg-white"
              data-networks-mobile-top=""
            >
              {data.topNetworks.map((row, index) => {
                const selected = row.id === activeNetwork;
                // Mobile: first 4 hubs, rest behind a More toggle (no mid-row clip).
                const mobileHide = index >= 4 && !mobileHubsOpen ? "hidden sm:list-item" : "";
                return (
                  <li key={row.id} className={mobileHide}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors sm:gap-3 sm:px-3 sm:py-2.5 ${selected ? "bg-[color:var(--cobalt-haze)]" : "hover:bg-[#f7f8fc]"}`}
                      onClick={() => setActiveNetwork(row.id)}
                      aria-pressed={selected}
                    >
                      <span className="w-5 shrink-0 text-[10px] tabular-nums text-[color:var(--fg-3)] sm:w-7 sm:text-xs">{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[color:var(--fg)] sm:text-sm">{row.label}</span>
                        <span className="hidden text-[11px] text-[color:var(--fg-3)] sm:block">{KIND_LABEL[row.kind]}</span>
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[color:var(--fg)] sm:text-sm">
                        {row.founderCount.toLocaleString("en-US")}
                        <span className="text-[color:var(--fg-3)]"> founders</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {data.topNetworks.length > 4 ? (
                <li className="sm:hidden">
                  <button
                    type="button"
                    className="w-full px-2.5 py-2 text-left text-[12px] font-medium text-[color:var(--cobalt)]"
                    data-networks-mobile-more=""
                    aria-expanded={mobileHubsOpen}
                    onClick={() => setMobileHubsOpen((open) => !open)}
                  >
                    {mobileHubsOpen
                      ? "Show fewer hubs"
                      : `More hubs (${(data.topNetworks.length - 4).toLocaleString("en-US")})`}
                  </button>
                </li>
              ) : null}
            </ol>

            <aside className="hidden rounded-lg border border-[color:var(--line)] bg-white p-4 lg:block" aria-live="polite">
              {active ? (
                <>
                  <div className="mb-2">
                    <h3 className="text-base font-semibold text-[color:var(--fg)]">{active.label}</h3>
                    <p className="text-xs text-[color:var(--fg-3)]">
                      {KIND_LABEL[active.kind]} · {active.companyCount.toLocaleString("en-US")} companies · {active.campusCount.toLocaleString("en-US")} campuses
                    </p>
                  </div>
                  <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                    {members.map((member) => (
                      <li key={`${member.founderId}-${member.companyId}`} className="rounded border border-[color:var(--line)] px-2.5 py-2">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                href={`/founders?q=${encodeURIComponent(member.founderName)}`}
                                className="truncate text-sm font-medium text-[color:var(--cobalt)] hover:underline"
                              >
                                {member.founderName}
                              </Link>
                              {member.campusLabel ? (
                                <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--line)] bg-[#f7f8fc] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--fg-2)]">
                                  {member.campusLabel}
                                </span>
                              ) : null}
                              {member.stage ? (
                                <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--cobalt-haze)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--cobalt)]">
                                  {member.stage}
                                </span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="mt-0.5 block truncate text-left text-xs text-[color:var(--fg-2)] hover:text-[color:var(--cobalt)] hover:underline"
                              onClick={() => setCompanyId(member.companyId)}
                            >
                              {member.companyName}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {members.length === 0 ? <p className="text-sm text-[color:var(--fg-3)]">No linked founders on file for this network.</p> : null}
                </>
              ) : (
                <p className="text-sm text-[color:var(--fg-3)]">Select a network to see founders and companies.</p>
              )}
            </aside>
          </div>
        </section>

        <section aria-labelledby="matrix-heading" className="order-3 overflow-hidden rounded-lg border border-[color:var(--line)] bg-white md:order-3">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={matrixOpen}
            onClick={() => setMatrixOpen((value) => !value)}
          >
            <span>
              <span id="matrix-heading" className="block text-[15px] font-semibold tracking-tight">
                Networks to campuses
              </span>
              <span className="mt-0.5 block text-[13px] text-[color:var(--fg-2)]">Where each network&apos;s linked founders are affiliated.</span>
            </span>
            <span className="text-sm text-[color:var(--fg-3)]">{matrixOpen ? "Hide" : "Show"}</span>
          </button>
          {matrixOpen ? (
            <div className="px-3 pb-3">
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-1 text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[12rem] bg-[#f6f7fb] px-2 py-2 text-left text-[11px] font-semibold text-[color:var(--fg-2)]">Network</th>
                      {data.matrix.columns.map((column) => (
                        <th key={column.id} className="min-w-[4.25rem] bg-[#f6f7fb] px-1 py-2 text-center text-[11px] font-semibold text-[color:var(--fg-2)]">
                          {column.label}
                        </th>
                      ))}
                      <th className="min-w-[4.5rem] bg-[#f6f7fb] px-2 py-2 text-right text-[11px] font-semibold text-[color:var(--fg-2)]">All campuses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.matrix.rows.map((row) => (
                      <tr key={row.id}>
                        <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-xs font-medium" scope="row">
                          <button type="button" className="text-left hover:text-[color:var(--cobalt)] hover:underline" onClick={() => setActiveNetwork(row.id)}>
                            {row.label}
                          </button>
                        </th>
                        {row.cells.map((cell, index) => (
                          <td key={`${row.id}-${data.matrix.columns[index]?.id ?? index}`} className="p-0 text-center">
                            <span
                              className="block rounded px-1 py-2 tabular-nums"
                              style={{ background: heat(cell.count, matrixMax), color: inkFor(cell.count, matrixMax) }}
                            >
                              {cell.count > 0 ? cell.count.toLocaleString("en-US") : "·"}
                            </span>
                          </td>
                        ))}
                        <td className="px-2 py-2 text-right font-medium tabular-nums">{row.all.count.toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-[color:var(--fg-3)]">{data.matrix.caption}</p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="concentration-heading" className="order-4 overflow-hidden rounded-lg border border-[color:var(--line)] bg-white md:order-4">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={concentrationOpen}
            onClick={() => setConcentrationOpen((value) => !value)}
          >
            <span>
              <span id="concentration-heading" className="block text-[15px] font-semibold tracking-tight">
                Concentration by sector
              </span>
              <span className="mt-0.5 block text-[13px] text-[color:var(--fg-2)]">Share of founder links that come from each sector&apos;s top 3 networks.</span>
            </span>
            <span className="text-sm text-[color:var(--fg-3)]">{concentrationOpen ? "Hide" : "Show"}</span>
          </button>
          {concentrationOpen ? (
            <div className="divide-y divide-[color:var(--line)] border-t border-[color:var(--line)]">
              {data.concentration.rows.map((row) => (
                <ConcentrationRow key={row.sectorId} row={row} />
              ))}
              <p className="px-4 py-3 text-[11px] text-[color:var(--fg-3)]">
                {data.concentration.thresholdsNote} {data.concentration.excludedNote}
              </p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="investor-hubs-heading" className="order-5 rounded-lg border border-[color:var(--line)] bg-white md:hidden">
          <div className="px-4 py-3">
            <h2 id="investor-hubs-heading" className="text-[15px] font-semibold tracking-tight">
              Investor hubs
            </h2>
            <p className="mt-0.5 text-[13px] text-[color:var(--fg-2)]">
              How many campus founders each investor-kind fund has reached in this corpus. {data.topFundNote}
            </p>
          </div>
          {data.investorHubs.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-[color:var(--fg-3)]">No investor-kind networks with linked founders are on file yet.</p>
          ) : (
            <ol className="divide-y divide-[color:var(--line)] border-t border-[color:var(--line)]">
              {data.investorHubs.map((row, index) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-7 shrink-0 text-xs tabular-nums text-[color:var(--fg-3)]">{String(index + 1).padStart(2, "0")}</span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[color:var(--fg)] hover:text-[color:var(--cobalt)] hover:underline"
                    onClick={() => setActiveNetwork(row.id)}
                  >
                    {row.label}
                  </button>
                  <span className="shrink-0 text-sm tabular-nums text-[color:var(--fg)]">
                    {row.founderCount.toLocaleString("en-US")}{" "}
                    <span className="text-[color:var(--fg-3)]">founders</span>
                  </span>
                  <span className="hidden shrink-0 text-xs tabular-nums text-[color:var(--fg-3)] sm:inline">
                    {row.companyCount.toLocaleString("en-US")} companies · {row.campusCount.toLocaleString("en-US")} campuses
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="how-heading" className="order-6 rounded-lg border border-[color:var(--line)] bg-white px-4 py-4 md:order-6">
          <h2 id="how-heading" className="text-[15px] font-semibold tracking-tight">
            How these counts work
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-[color:var(--fg-2)]">
            {data.howItWorks.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {data.totals.omitted.length > 0 ? (
            <p className="mt-3 text-xs text-[color:var(--fg-3)]">
              Omitted tie types: {data.totals.omitted.map((item) => `${item.kind} (${item.reason})`).join(" ")}
            </p>
          ) : null}
        </section>
      </main>

      {companyId ? <StartupCardSheet id={companyId} onClose={() => setCompanyId(null)} /> : null}
    </div>
  );
}

function ConcentrationRow({ row }: { row: SectorConcentration }) {
  const bandColor =
    row.band === "Concentrated" ? "text-[color:var(--cobalt)]" : row.band === "Moderate" ? "text-[color:var(--amber)]" : "text-[color:var(--fg-2)]";
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[color:var(--fg)]">{row.label}</div>
        <div className="text-xs text-[color:var(--fg-3)]">
          Top 3: {row.top3.map((item) => item.label).join(" · ")} · {row.sourceCount.toLocaleString("en-US")} sources
        </div>
      </div>
      <div className="flex shrink-0 items-baseline gap-3">
        <span className="text-sm tabular-nums text-[color:var(--fg)]">
          {row.founderLinks.toLocaleString("en-US")} <span className="text-[color:var(--fg-3)]">founder links</span>
        </span>
        <span className={`text-sm font-semibold tabular-nums ${bandColor}`}>
          {row.band} {pct(row.top3Share)}
        </span>
      </div>
    </div>
  );
}
