import { setTierOverride, clearTierOverride } from "@/lib/actions/tier-override";

const TIERS = ["S+", "S", "A", "B", "C", "D"];

export function TierOverrideForm({
  sourceId,
  currentFounderTier,
  currentStartupTier,
  hasOverride,
}: {
  sourceId: string;
  currentFounderTier: string;
  currentStartupTier: string;
  hasOverride: boolean;
}) {
  return (
    <details className="rounded-md border border-border-c">
      <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-muted">Override tier</summary>
      <form action={setTierOverride} className="flex flex-wrap items-end gap-2 border-t border-border-c p-2">
        <input type="hidden" name="sourceId" value={sourceId} />
        <input type="hidden" name="overrideBy" value="amy" />
        <div>
          <label className="block text-[11px] text-muted">Founder Scout</label>
          <select name="founderScoutTier" defaultValue={currentFounderTier} className="rounded-md border border-border-c bg-surface px-1.5 py-1 text-xs">
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted">Startup Scout</label>
          <select name="startupScoutTier" defaultValue={currentStartupTier} className="rounded-md border border-border-c bg-surface px-1.5 py-1 text-xs">
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <input name="reason" required placeholder="Why (required, stored with who/when)" className="min-w-[180px] flex-1 rounded-md border border-border-c bg-surface px-2 py-1 text-xs" />
        <button type="submit" className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
          Save
        </button>
      </form>
      {hasOverride && (
        <form action={clearTierOverride} className="border-t border-border-c p-2">
          <input type="hidden" name="sourceId" value={sourceId} />
          <button type="submit" className="text-xs text-muted underline">
            Clear override (revert to catalogue default)
          </button>
        </form>
      )}
    </details>
  );
}
