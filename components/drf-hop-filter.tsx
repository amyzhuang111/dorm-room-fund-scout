export function DrfHopFilter({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="pt-1">
      <label className="flex items-start gap-2 text-xs text-black">
        <input type="checkbox" className="mt-0.5 accent-black" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span>Within 2 hops of a DRF alum</span>
      </label>
      <p className="pt-1 text-[10px] leading-snug text-neutral-600">Shared school, club, program, prior company, or co-founder. Same-school links are included and rank last on a profile.</p>
    </div>
  );
}
