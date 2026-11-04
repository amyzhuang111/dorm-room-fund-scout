"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CampusSeal } from "@/components/campus-seal";
import { NetworksGraph, type NetworkMapFocus } from "@/components/networks-graph";
import { StartupCardSheet } from "@/components/startup-directory-card";
import { searchFounderNetworks, selectedNetworkMembers } from "@/lib/domain/network-directory-search";
import { nounFor } from "@/lib/display/plural";
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
  const [mapFocus, setMapFocus] = useState<NetworkMapFocus | null>(null);
  const [activeNetwork, setActiveNetwork] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [concentrationOpen, setConcentrationOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [desktopHubsOpen, setDesktopHubsOpen] = useState(false);
  const [networkQuery, setNetworkQuery] = useState("");
  const [networkKind, setNetworkKind] = useState<NetworkKind | "all">("all");
  const [graphInspectorOpen, setGraphInspectorOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadPage()
      .then((page) => {
        if (cancelled) return;
        setData(page);
        const requested = new URLSearchParams(window.location.search).get("network");
        const known = requested && page.topNetworks.some((network) => network.id === requested);
        setActiveNetwork((current) => current ?? (known ? requested : page.topNetworks[0]?.id ?? null));
        setGraphInspectorOpen(Boolean(known));
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
    [data, activeNetwork],
  );
  const networkMatches = useMemo(
    () => searchFounderNetworks(data?.topNetworks ?? [], data?.membersByNetwork ?? {}, networkQuery, networkKind),
    [data, networkQuery, networkKind],
  );
  const displayedNetworks = useMemo(() => networkMatches.map((match) => match.network), [networkMatches]);
  const members: NetworkMember[] = selectedNetworkMembers(activeNetwork, networkMatches, data?.membersByNetwork ?? {});
  const fullMembers: NetworkMember[] = active && data ? data.membersByNetwork[active.id] ?? [] : [];

  /** Hub clicks open an immediate inspector; list clicks keep the roster in view. */
  function chooseNetwork(id: string, showInspector = false, clearFilters = showInspector) {
    setActiveNetwork(id);
    setGraphInspectorOpen(showInspector);
    setShareFeedback("");
    if (clearFilters) {
      setNetworkQuery("");
      setNetworkKind("all");
    }
    const url = new URL(window.location.href);
    url.searchParams.set("network", id);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }

  function selectSearchResult(match: (typeof networkMatches)[number]) {
    chooseNetwork(match.network.id, true, false);
    setMapFocus({
      networkId: match.network.id,
      founderId: match.nameMatch ? undefined : match.matchingMembers[0]?.founderId,
    });
  }

  async function copyNetworkLink() {
    if (!active) return;
    const url = new URL(window.location.href);
    url.searchParams.set("network", active.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareFeedback("Link copied");
    } catch {
      setShareFeedback("Copy unavailable; use your address bar");
    }
  }

  function scrollToRoster() {
    setGraphInspectorOpen(false);
    document.getElementById("network-roster")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  let matrixMax = 0;
  if (data) {
    for (const row of data.matrix.rows) {
      for (const cell of row.cells) matrixMax = Math.max(matrixMax, cell.count);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen px-5 py-10 text-sm text-[color:var(--fg-2)]" data-networks-page="" data-networks-cream="1" style={{ background: "var(--networks-bg, #ece9e4)" }}>
        {loadError}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen px-5 py-10 text-sm text-[color:var(--fg-3)]" data-networks-page="" data-networks-cream="1" style={{ background: "var(--networks-bg, #ece9e4)" }}>
        Loading networks...
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden text-[color:var(--fg)]" data-networks-page="" data-networks-cream="1" style={{ background: "var(--networks-bg, #ece9e4)" }}>
      <header className="border-b border-[color:var(--line)]" style={{ background: "var(--networks-bg, #ece9e4)" }} data-networks-hero="">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-1 px-4 py-3 sm:gap-1.5 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2 text-[color:var(--cobalt)]">
            <CampusSeal label="CS" title="Campus Scout" size="sm" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] sm:text-xs">Campus Scout</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-[color:var(--fg)] sm:text-2xl">Campus founder networks</h1>
          <p className="hidden max-w-3xl text-[12px] leading-snug text-[color:var(--fg-2)] sm:block sm:text-sm sm:leading-normal" data-networks-context="">
            Find the founders and startups linked to a program, university accelerator, lab or fund. Open a network to see its documented founder-company relationships.
          </p>
          <p className="text-[11px] text-[color:var(--fg-3)] sm:text-xs" data-networks-stats="" data-hero-stat="">
            <span data-networks-count="networks">{data.totals.networks.toLocaleString("en-US")}</span> networks ·{" "}
            <span data-networks-count="founders">{data.totals.foundersLinked.toLocaleString("en-US")}</span> linked founders
            <span className="hidden sm:inline">
              {" · "}
              <span data-networks-count="founderLinks">{data.totals.founderLinks.toLocaleString("en-US")}</span> documented founder-network links ·{" "}
              <span data-networks-count="companies">{data.totals.companyTotal.toLocaleString("en-US")}</span> of{" "}
              <span data-networks-count="corpusCompanies">{data.totals.corpusCompanies.toLocaleString("en-US")}</span> investable companies covered
            </span>
          </p>

        </div>
      </header>

      <main className="flex flex-col gap-0">
        <nav aria-label="Networks sections" className="order-1 mx-auto hidden w-full max-w-[1400px] flex-wrap gap-x-5 border-b border-[color:var(--line)] px-4 py-2 text-sm sm:flex sm:px-6">
          <a className="py-2 underline-offset-4 hover:underline" href="#network-map">Map</a>
          <a className="py-2 underline-offset-4 hover:underline" href="#top-networks-heading">All networks</a>
          <a className="py-2 underline-offset-4 hover:underline" href="#network-roster">Founder links</a>
        </nav>
        <div className="order-1 mx-auto hidden w-full max-w-[1400px] items-start gap-5 px-4 py-5 sm:grid sm:px-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside aria-labelledby="popular-networks-heading" className="rounded-xl border border-[color:var(--line)] bg-white p-3">
            <h2 id="popular-networks-heading" className="px-2 text-base font-semibold">Top networks</h2>
            <p className="px-2 pb-2 text-xs text-[color:var(--fg-2)]">Choose a network to see its founders and startups.</p>
            {displayedNetworks.length === 0 ? <p className="px-2 text-sm">No matching networks.</p> : null}
            <label className="mb-2 block px-2 text-[11px] font-semibold text-[color:var(--fg-2)]">
              Network type
              <select
                value={networkKind}
                onChange={(event) => { setNetworkKind(event.target.value as NetworkKind | "all"); setDesktopHubsOpen(false); }}
                aria-label="Filter networks by type"
                className="mt-1 h-11 w-full rounded-md border border-[color:var(--line)] bg-white px-2.5 text-sm text-[color:var(--fg)]"
              >
                <option value="all">All types</option>
                <option value="accelerator">Accelerators</option>
                <option value="program">Programs</option>
                <option value="investor">Investors</option>
                <option value="lab">Labs</option>
              </select>
            </label>
            <ol className="divide-y divide-[color:var(--line)]">
              {displayedNetworks.slice(0, 10).map((row, index) => (
                <li key={row.id}>
                  <button type="button" aria-pressed={graphInspectorOpen && row.id === activeNetwork}
                    className="grid min-h-12 w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f7f8fc] aria-pressed:bg-[color:var(--cobalt-haze)]"
                    onClick={() => {
                      chooseNetwork(row.id, true, false);
                      setMapFocus({ networkId: row.id });
                    }}>
                    <span className="text-xs text-[color:var(--fg-3)]">{index + 1}</span>
                    <span className="font-medium">{row.label}</span>
                    <span className="text-right text-xs tabular-nums">{row.founderCount.toLocaleString("en-US")}<br />founders</span>
                  </button>
                </li>
              ))}
            </ol>
            <a href="#top-networks-heading" className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-[color:var(--cobalt)] hover:underline">Browse all networks</a>
          </aside>
        <section id="network-map" aria-labelledby="graph-heading" className="hidden min-w-0 scroll-mt-24 rounded-xl border border-[color:var(--line)] bg-white sm:block">
          <div className="mx-auto max-w-[1400px] px-4 pt-2 sm:px-6">
            <h2 id="graph-heading" className="sr-only">
              Network map
            </h2>
            <p className="mb-1 hidden text-[12px] text-[color:var(--fg-2)] sm:block" data-networks-context-desk="">
              Search above or browse the network list to open founder, startup, and source details. Use the map to explore nearby connections.
            </p>
            <p className="mb-1 text-[11px] text-[color:var(--fg-2)] sm:hidden" data-networks-context-mobile="">
              Campus-colored founders and program hubs. Scroll to zoom.
            </p>
          </div>
          <div className="border-b border-[color:var(--line)] px-3 pb-3">
          <div className="flex items-center" data-network-quick-find="">
            <label className="min-w-[210px] flex-[1_1_340px] text-[11px] font-semibold text-[color:var(--fg-2)]">
              Search a founder, startup, campus, program or fund
              <input
                type="search"
                value={networkQuery}
                onChange={(event) => { setNetworkQuery(event.target.value); setDesktopHubsOpen(false); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && networkMatches[0]) selectSearchResult(networkMatches[0]);
                }}
                placeholder="Search founders, startups, or networks…"
                aria-label="Find founders, startups and networks"
                className="mt-1 h-11 w-full rounded-md border border-[color:var(--line)] bg-white px-3 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--cobalt)]"
              />
            </label>
          </div>
          {networkQuery.trim() ? (
            <div className="mt-2 rounded-md border border-[color:var(--line)] bg-white p-2" data-network-quick-results="">
              <p role="status" className="mb-1 text-[11px] text-[color:var(--fg-3)]">
                {networkMatches.length.toLocaleString("en-US")} matching networks. Select one to see its linked founders.
              </p>
              {networkMatches.slice(0, 4).map((match) => (
                <button
                  key={match.network.id}
                  type="button"
                  onClick={() => selectSearchResult(match)}
                  className="flex min-h-10 w-full items-center justify-between gap-3 rounded px-2 text-left text-xs hover:bg-[color:var(--cobalt-haze)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--cobalt)]"
                  data-network-quick-result={match.network.id}
                >
                  <span className="min-w-0 font-semibold">{match.network.label}</span>
                  <span className="shrink-0 text-[color:var(--fg-3)]">
                    {match.nameMatch
                      ? `${match.network.founderCount.toLocaleString("en-US")} ${nounFor(match.network.founderCount, "founder")}`
                      : `${match.matchingMembers.length.toLocaleString("en-US")} member matches`}
                  </span>
                </button>
              ))}
              {networkMatches.length === 0 ? <p className="px-2 py-3 text-xs text-[color:var(--fg-3)]">No source-linked founders or networks match this search. Try a different name or network type.</p> : null}
            </div>
          ) : null}
          </div>
          <div className="relative md:min-h-0" data-network-map-and-inspector="">
            <NetworksGraph
              mapFocus={mapFocus}
              investorHubs={data.investorHubs}
              onSelectCompany={(id) => setCompanyId(id)}
              onSelectNetwork={(id) => chooseNetwork(id, true)}
            />
            {graphInspectorOpen && active ? (
              <aside
                data-network-map-inspector=""
                role="region"
                aria-label={`Selected network: ${active.label}`}
                className="mx-auto my-3 w-[calc(100%-2rem)] max-w-[1352px] rounded-xl border border-[color:var(--line)] bg-white p-3 sm:p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--cobalt)]">{KIND_LABEL[active.kind]}</span>
                    <h3 className="mt-0.5 break-words text-base font-bold text-[color:var(--fg)]">{active.label}</h3>
                    <p className="mt-1 text-[11px] text-[color:var(--fg-2)]">
                      {active.founderCount.toLocaleString("en-US")} linked founders ·{" "}
                      {active.companyCount.toLocaleString("en-US")} companies ·{" "}
                      {active.campusCount.toLocaleString("en-US")} campuses
                    </p>
                  </div>
                  <button type="button" onClick={() => setGraphInspectorOpen(false)}
                    aria-label="Close network details" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--line)] text-lg text-[color:var(--fg-2)] hover:bg-[#f3f5fb]">×</button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2" data-network-map-members="">
                  {(members.length ? members : fullMembers).slice(0, 4).map((member) => (
                    <NetworkMemberEntry
                      key={`${member.founderId}-${member.companyId}`}
                      member={member}
                      onPreview={() => setCompanyId(member.companyId)}
                      compact
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={scrollToRoster}
                    className="min-h-10 rounded-md bg-[color:var(--cobalt)] px-3 text-xs font-semibold text-white hover:opacity-90">
                    View {fullMembers.length.toLocaleString("en-US")} founder-company links
                  </button>
                  <button type="button" onClick={() => void copyNetworkLink()}
                    className="min-h-10 rounded-md border border-[color:var(--line)] bg-white px-3 text-xs font-semibold text-[color:var(--cobalt)] hover:bg-[#f4f6fb]">
                    Copy link
                  </button>
                </div>
                {shareFeedback ? <p role="status" className="mt-2 text-[11px] text-[color:var(--fg-2)]">{shareFeedback}</p> : null}
              </aside>
            ) : null}
          </div>
        </section>
        </div>

        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-3 py-2 sm:gap-5 sm:px-6 sm:py-6">

        <section aria-labelledby="top-networks-heading" className="order-2">
          <div className="mb-2 sm:mb-3">
            <h2 id="top-networks-heading" className="scroll-mt-24 text-base font-semibold tracking-tight sm:text-lg">
              Explore founder networks
            </h2>
            <p className="hidden text-[12px] text-[color:var(--fg-2)] sm:block sm:text-sm">
              Choose a network, then open its founders or startups. A link reflects a documented public connection, not an inferred relationship.
            </p>
          </div>
          <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2" data-network-directory-results="">
            <p className="hidden text-xs tabular-nums text-[color:var(--fg-3)] sm:block" data-network-results-count="" role="status">
              {displayedNetworks.length.toLocaleString("en-US")} evidenced networks match the current filters.
            </p>
            {networkQuery || networkKind !== "all" ? (
              <button type="button"
                onClick={() => { setNetworkQuery(""); setNetworkKind("all"); setDesktopHubsOpen(false); }}
                className="min-h-9 rounded-md border border-[color:var(--line)] bg-white px-3 text-xs font-semibold text-[color:var(--cobalt)] hover:bg-[#f3f6fd]">
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-4">
            <ol
              className="block divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)] bg-white"
              data-networks-desktop-top=""
            >
              {displayedNetworks.map((row, index) => {
                const selected = row.id === activeNetwork;
                const deskLimit = 12;
                const deskHide = index >= deskLimit && !desktopHubsOpen ? "hidden" : "";
                return (
                  <li key={row.id} className={deskHide}>
                    <button
                      type="button"
                      className={`flex w-full items-start gap-2 border-l-2 px-2.5 py-2 text-left transition-colors sm:gap-3 sm:px-3 sm:py-2.5 ${selected ? "border-l-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt-haze)] ring-1 ring-inset ring-[color:var(--cobalt,#2F4FD8)]/40" : "border-l-transparent hover:bg-[#f7f8fc]"}`}
                      onClick={() => chooseNetwork(row.id)}
                      aria-pressed={selected}
                    >
                      <span className="w-5 shrink-0 pt-0.5 text-[10px] tabular-nums text-[color:var(--fg-3)] sm:w-7 sm:text-xs">
                        {networkQuery ? "•" : String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-normal break-words text-[13px] font-medium leading-snug text-[color:var(--fg)] sm:text-sm">
                          {row.label}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)] sm:text-[11px]" data-network-kind="">{KIND_LABEL[row.kind]}</span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-[12px] tabular-nums text-[color:var(--fg)] sm:text-sm">
                        {row.founderCount.toLocaleString("en-US")}
                        <span className="text-[color:var(--fg-3)]"> founders</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {displayedNetworks.length === 0 ? (
                <li className="px-4 py-5 text-sm text-[color:var(--fg-3)]">No networks match these filters.</li>
              ) : null}
              {displayedNetworks.length > 12 ? (
                <li>
                  <button
                    type="button"
                    className="w-full px-2.5 py-2 text-left text-[12px] font-medium text-[color:var(--cobalt)]"
                    data-networks-desktop-more=""
                    aria-expanded={desktopHubsOpen}
                    onClick={() => setDesktopHubsOpen((open) => !open)}
                  >
                    {desktopHubsOpen
                      ? "Show fewer networks"
                      : `More networks (${(displayedNetworks.length - 12).toLocaleString("en-US")})`}
                  </button>
                </li>
              ) : null}
            </ol>

            <aside id="network-roster" className="scroll-mt-5 rounded-lg border border-[color:var(--line)] bg-white p-4" aria-live="polite" data-network-selected-roster="">
              {active ? (
                <>
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--cobalt)]">{KIND_LABEL[active.kind]}</p>
                    <h3 className="mt-1 break-words text-base font-semibold text-[color:var(--fg)]">{active.label}</h3>
                    <p className="mt-1 text-xs text-[color:var(--fg-3)]">
                      {active.founderCount.toLocaleString("en-US")} distinct founders ·{" "}
                      {active.companyCount.toLocaleString("en-US")} companies ·{" "}
                      {active.campusCount.toLocaleString("en-US")} campuses
                    </p>
                    <p className="mt-1 text-[11px] text-[color:var(--fg-3)]" data-network-roster-count="">
                      Showing {members.length.toLocaleString("en-US")} of {fullMembers.length.toLocaleString("en-US")} founder-company links
                      {networkQuery && members.length < fullMembers.length ? " matching your search" : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void copyNetworkLink()}
                        className="min-h-9 rounded-md border border-[color:var(--line)] px-2.5 text-xs font-semibold text-[color:var(--cobalt)] hover:bg-[#f3f5fb]">Copy network link</button>
                      <Link href="/founder/discover"
                        className="inline-flex min-h-9 items-center rounded-md border border-[color:var(--line)] px-2.5 text-xs font-semibold text-[color:var(--fg-2)] hover:bg-[#f3f5fb]">Search all founders</Link>
                    </div>
                    {shareFeedback ? <p role="status" className="mt-1 text-xs text-[color:var(--fg-2)]">{shareFeedback}</p> : null}
                  </div>
                  <ul className="max-h-72 space-y-2 overflow-y-auto pr-1 lg:max-h-[32rem]">
                    {members.map((member) => (
                      <li key={`${member.founderId}-${member.companyId}`}>
                        <NetworkMemberEntry member={member} onPreview={() => setCompanyId(member.companyId)} />
                      </li>
                    ))}
                  </ul>
                  {members.length === 0 ? (
                    <p className="text-sm text-[color:var(--fg-3)]">
                      No founder-company links match this search in the selected network. Clear the filters to see all {fullMembers.length.toLocaleString("en-US")} links.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-[color:var(--fg-3)]">Choose a network to inspect its founders and companies.</p>
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
                          <button type="button" className="text-left hover:text-[color:var(--cobalt)] hover:underline" onClick={() => chooseNetwork(row.id)}>
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


        <section aria-labelledby="how-heading" className="order-6 overflow-hidden rounded-lg border border-[color:var(--line)] bg-white">
          <button type="button" onClick={() => setMethodologyOpen((value) => !value)}
            className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={methodologyOpen} aria-controls="network-method-details">
            <span>
              <span id="how-heading" className="block text-[15px] font-semibold tracking-tight">How the evidence works</span>
              <span className="mt-0.5 block text-xs text-[color:var(--fg-2)]">What counts as a founder, program connection or network link</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-[color:var(--cobalt)]">{methodologyOpen ? "Hide" : "Show"}</span>
          </button>
          {methodologyOpen ? (
            <div id="network-method-details" className="border-t border-[color:var(--line)] px-4 py-4">
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-[color:var(--fg-2)]">
                {data.howItWorks.map((line) => <li key={line}>{line}</li>)}
              </ul>
              {data.totals.omitted.length > 0 ? (
                <p className="mt-3 text-xs text-[color:var(--fg-3)]">
                  Omitted tie types: {data.totals.omitted.map((item) => `${item.kind} (${item.reason})`).join(" ")}
                </p>
              ) : null}
              <p className="mt-3 text-xs text-[color:var(--fg-3)]">
                Follow individual Evidence links above to verify a particular network connection in its original public source.
              </p>
            </div>
          ) : null}
        </section>
        </div>
      </main>

      {companyId ? <StartupCardSheet id={companyId} onClose={() => setCompanyId(null)} /> : null}
    </div>
  );
}

/**
 * Every name has a useful next step: a founder's searchable profile,
 * the complete company record, or an in-place quick preview.
 */
function NetworkMemberEntry({
  member,
  onPreview,
  compact = false,
}: {
  member: NetworkMember;
  onPreview: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-md border border-[color:var(--line)] bg-white px-2.5 py-2 ${compact ? "text-xs" : "text-sm"}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          href={`/founder/discover?q=${encodeURIComponent(member.founderName)}`}
          className="min-w-0 break-words font-semibold text-[color:var(--cobalt)] hover:underline"
          title={`Find ${member.founderName} in Founder Scout`}
          data-network-founder-link={member.founderId}
        >
          {member.founderName}
        </Link>
        {member.campusLabel ? (
          <span className="rounded-full border border-[color:var(--line)] bg-[#f6f7fb] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--fg-2)]">
            {member.campusLabel}
          </span>
        ) : null}
        {member.stage ? (
          <span className="rounded-full bg-[color:var(--cobalt-haze)] px-1.5 py-0.5 text-[10px] text-[color:var(--cobalt)]">{member.stage}</span>
        ) : null}
      </div>
      <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
        <Link href={`/startup/${member.companyId}`}
          className="min-w-0 break-words text-[11px] font-medium text-[color:var(--fg-2)] hover:text-[color:var(--cobalt)] hover:underline"
          data-network-company-link={member.companyId}
          title={`Open ${member.companyName} company record`}
        >
          {member.companyName}
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          {member.sourceUrl && /^https?:\/\//i.test(member.sourceUrl) ? (
            <a href={member.sourceUrl} target="_blank" rel="noopener noreferrer"
              title="Open the published evidence for this network connection"
              className="inline-flex min-h-8 items-center rounded border border-[color:var(--line)] px-2 text-[10px] font-semibold text-[color:var(--fg-2)] hover:bg-[#f3f6fc]"
              data-network-evidence-link="">
              Evidence
            </a>
          ) : null}
          <button type="button" onClick={onPreview} aria-label={`Quick view ${member.companyName}`}
            className="min-h-8 shrink-0 rounded border border-[color:var(--line)] px-2 text-[10px] font-semibold text-[color:var(--cobalt)] hover:bg-[#eff2fd]">
            Preview
          </button>
        </div>
      </div>
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
