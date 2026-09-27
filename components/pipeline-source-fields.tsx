"use client";

import { SOURCE_CHANNELS, type SourceChannel } from "@/lib/domain/user-pipeline";

export function PipelineSourceFields({
  sourcedVia,
  referrer,
  compact = false,
  onChange,
}: {
  sourcedVia: SourceChannel | null;
  referrer: string | null;
  compact?: boolean;
  onChange: (next: { sourcedVia: SourceChannel | null; referrer: string | null }) => void;
}) {
  return (
    <div className={compact ? "mt-2 space-y-1" : "mt-3 grid gap-3 sm:grid-cols-2"}>
      <label className="block text-xs font-semibold uppercase tracking-wide">
        Sourced via
        <select
          aria-label="Sourced via"
          value={sourcedVia ?? ""}
          onChange={(event) => onChange({ sourcedVia: (event.target.value || null) as SourceChannel | null, referrer })}
          className="mt-1 w-full rounded-md border border-black bg-white px-2 py-1 text-xs font-normal normal-case tracking-normal text-black"
        >
          <option value="">Not set</option>
          {SOURCE_CHANNELS.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide">
        Referrer
        <input
          aria-label="Referrer"
          value={referrer ?? ""}
          maxLength={120}
          placeholder="Optional"
          onChange={(event) => onChange({ sourcedVia, referrer: event.target.value })}
          className="mt-1 w-full rounded-md border border-black bg-white px-2 py-1 text-xs font-normal normal-case tracking-normal text-black"
        />
      </label>
    </div>
  );
}
