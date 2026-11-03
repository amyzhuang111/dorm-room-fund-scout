"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CampusSeal } from "@/components/campus-seal";
import { LogoMark } from "@/components/sample-instrument";
import {
  assignWhyWorthALook,
  type FounderLead,
} from "@/lib/domain/founder-index";
import { founderIsOpenLane } from "@/lib/domain/open-lane";
import { fetchSampleDirectory } from "@/lib/domain/sample-directory-client";

/**
 * Filtered open-lane founder list for /founders?lane=open[&campus=…].
 * Membership matches FoldOpenLaneHero via founderIsOpenLane + investable desk ids.
 */
export function OpenLaneFounders({ campusId = null }: { campusId?: string | null }) {
  const [founders, setFounders] = useState<FounderLead[]>([]);
  const [investable, setInvestable] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const [cards, res] = await Promise.all([
          fetchSampleDirectory(),
          fetch("/data/founders.json", { cache: "no-store" }),
        ]);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as FounderLead[];
        if (!Array.isArray(data) || data.length === 0) throw new Error("empty founders");
        if (dead) return;
        setInvestable(new Set(cards.map((c) => c.id).filter(Boolean)));
        setFounders(data);
        setStatus("ready");
      } catch {
        if (!dead) setStatus("error");
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  const open = useMemo(
    () => founders.filter((f) => founderIsOpenLane(f, investable)),
    [founders, investable],
  );

  const matches = useMemo(() => {
    if (!campusId) return open;
    return open.filter((f) => f.campusId === campusId);
  }, [open, campusId]);

  const campusName = matches.find((f) => f.campusId === campusId)?.campus
    ?? open.find((f) => f.campusId === campusId)?.campus
    ?? null;

  const whyById = useMemo(() => assignWhyWorthALook(matches), [matches]);

  return (
    <div
      data-open-lane-founders=""
      data-open-lane-loaded={status === "ready" ? "1" : "0"}
      data-open-lane-campus={campusId || ""}
      data-open-lane-count={status === "ready" ? String(matches.length) : ""}
    >
      <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">
        Open lane
        {campusName ? ` · ${campusName}` : ""}
      </p>
      <p className="mt-2 text-[14px] text-fg-2">
        <span className="num" data-open-lane-figure="">
          {status === "ready" ? matches.length.toLocaleString("en-US") : "…"}
        </span>{" "}
        strong student founders on the investable desk with no top fund yet
        {campusName ? ` at ${campusName}` : ""}
      </p>
      {campusId ? (
        <p className="mt-2">
          <Link
            href="/founders?lane=open"
            className="font-mono text-[12px] font-semibold text-[color:var(--cobalt,#2F4FD8)] underline-offset-2 hover:underline"
            data-open-lane-clear-campus=""
          >
            Clear campus · show all open lane
          </Link>
        </p>
      ) : null}

      <div className="mt-8">
        {status === "loading" ? (
          <p className="text-[14px] text-fg-3" data-open-lane-loading="">
            Loading open lane…
          </p>
        ) : null}
        {status === "error" ? (
          <p className="text-[14px] text-[color:var(--ember,#D96B1C)]">Could not load the open lane.</p>
        ) : null}
        {status === "ready" && matches.length === 0 ? (
          <p className="text-[14px] text-fg-2" data-open-lane-empty="">
            No open-lane founders match this view.
          </p>
        ) : null}
        {status === "ready" && matches.length > 0 ? (
          <ol className="divide-y divide-[color:var(--line,#E1E5EF)] border-y border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]" data-open-lane-list="">
            {matches.map((founder) => {
              const why = whyById.get(founder.id) ?? null;
              return (
                <li key={founder.id} data-open-lane-card="" data-founder-card="">
                  <article className="bg-[color:var(--bg,#FFFFFF)] px-4 py-4 lg:px-3 lg:py-2.5">
                    <div className="flex items-start gap-2 lg:gap-3">
                      <CampusSeal label={founder.campus} size="lg" className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[16px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]" data-founder-name="">
                          {founder.name}
                        </h3>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-[color:var(--fg-2,#3F465C)]">
                          <span>{founder.campus?.trim() || "Campus missing"}</span>
                          <span aria-hidden="true">·</span>
                          {founder.company && founder.companyId ? (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <LogoMark
                                name={founder.company}
                                logoUrl={`/company-logos/${founder.companyId}.webp`}
                                size={18}
                              />
                              <Link
                                href={`/startup/${founder.companyId}?from=open-lane${campusId ? `&campus=${encodeURIComponent(campusId)}` : ""}`}
                                className="font-semibold text-[color:var(--fg,#0B0E17)] hover:text-[color:var(--cobalt,#2F4FD8)] hover:underline"
                              >
                                {founder.company}
                              </Link>
                            </span>
                          ) : (
                            <span>{founder.company?.trim() || "Company missing"}</span>
                          )}
                        </p>
                        {why ? (
                          <p className="mt-1 border-l-2 border-[color:var(--cobalt,#2F4FD8)]/45 pl-2.5 text-[12px] leading-4 text-[color:var(--fg,#0B0E17)]" data-why-worth="">
                            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Why worth a look</span>
                            <span className="mt-1 block">{why}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
