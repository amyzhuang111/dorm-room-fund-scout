"use client";

import { SOURCE_CHANNELS, type SourceChannel, type UserPipelineState } from "@/lib/domain/user-pipeline";

const BENCHMARK: { id: SourceChannel; label: string; pct: number }[] = [
  { id: "open_application", label: "Open application", pct: 5 },
  { id: "alum_referral", label: "Alum referral", pct: 40 },
  { id: "relationship", label: "Relationship", pct: 60 },
];

export function PipelineSourceMix({ state }: { state: UserPipelineState }) {
  const entries = [
    ...state.startups.map((startup) => startup.sourcedVia ?? null),
    ...state.links.map((link) => link.sourcedVia ?? null),
  ];
  const total = entries.length;
  const counts = new Map<string, number>();
  for (const channel of entries) counts.set(channel ?? "unset", (counts.get(channel ?? "unset") ?? 0) + 1);

  return (
    <section className="mt-4 rounded-md border border-black bg-white p-3 text-black">
      <h2 className="text-sm font-semibold">Sourced via</h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-700">
        DRF&apos;s sourcing mix is roughly open applications 5%, alumni referrals 40%, and relationship-driven 60%. Those benchmark buckets overlap, so they are not shares of one whole. Each pipeline entry here has one channel.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <MixColumn title={total ? `This pipeline · ${total}` : "This pipeline"} rows={[
          ...SOURCE_CHANNELS.map((channel) => ({ label: channel.label, pct: total ? ((counts.get(channel.id) ?? 0) / total) * 100 : 0, note: String(counts.get(channel.id) ?? 0) })),
          { label: "Not set", pct: total ? ((counts.get("unset") ?? 0) / total) * 100 : 0, note: String(counts.get("unset") ?? 0) },
        ]} />
        <MixColumn title="DRF benchmark" rows={BENCHMARK.map((row) => ({ label: row.label, pct: row.pct, note: `${row.pct}%` }))} />
      </div>
    </section>
  );
}

function MixColumn({ title, rows }: { title: string; rows: { label: string; pct: number; note: string }[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span>{row.label}</span>
              <span className="tabular-nums text-neutral-700">{row.note}</span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-sm bg-neutral-200">
              <div className="h-1.5 rounded-sm bg-black" style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
