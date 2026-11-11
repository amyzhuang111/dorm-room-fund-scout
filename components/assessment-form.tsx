import { saveAssessment } from "@/lib/actions/assessment";
import { benchmark } from "@/lib/scoring/benchmark";
import type { Ratings } from "@/lib/scoring/rubric";
import { RUBRIC_DIMENSIONS } from "@/lib/scoring/rubric";
import type { AssessmentHistoryRow } from "@/lib/domain/queries";

const RATING_OPTIONS = [
  { value: "unknown", label: "Unknown / not assessable" },
  { value: "0", label: "0 · affirmative evidence of a major weakness" },
  { value: "1", label: "1 · materially weak evidence" },
  { value: "2", label: "2 · relevant evidence, major concerns" },
  { value: "3", label: "3 · credible evidence" },
  { value: "4", label: "4 · unusually strong, specific evidence" },
  { value: "5", label: "5 · exceptional, corroborated evidence" },
];

export function AssessmentForm({ projectId, history }: { projectId: string; history: AssessmentHistoryRow[] }) {
  const latest = history[0];
  return (
    <div className="space-y-3">
      {history.length > 0 && (
        <ul className="space-y-1.5">
          {history.map((h) => (
            <li key={h.id} className="rounded-md border border-border-c bg-surface-2 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  {h.qualityScore != null ? `${h.qualityScore}/100` : "No headline score"} (coverage {Math.round(h.coverage * 100)}%)
                </span>
                <span className="text-muted">
                  {h.evaluator} · {h.createdAt.slice(0, 10)}
                </span>
              </div>
              <p className="mt-1 font-medium text-blue-800">{benchmark(h.ratings as Ratings).tier === 'Unassessed' ? 'Benchmark: insufficient evidence' : `Benchmark ${benchmark(h.ratings as Ratings).tier}`}</p>
              <details className="mt-2"><summary className="cursor-pointer text-blue-700">Seven-factor breakdown</summary><dl className="mt-2 grid gap-1 sm:grid-cols-2">{RUBRIC_DIMENSIONS.map(d => <div key={d.key} className="flex justify-between gap-2"><dt>{d.label} ({d.weight}%)</dt><dd className="shrink-0">{h.ratings[d.key] == null ? 'Unknown' : `${h.ratings[d.key]}/5`}</dd></div>)}</dl><p className="mt-2 text-muted">A ≥80 · B ≥65 · C ≥50 · D below 50. At least 70% coverage and all three required dimensions must be assessed. Program/investor tiers and eligibility are separate.</p>{h.evidenceSourceUrl?.startsWith('https://') && <a href={h.evidenceSourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-blue-700 underline">Assessment source</a>}</details>
              {h.notes && <p className="mt-1 text-foreground">{h.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-border-c">
        <summary className="cursor-pointer px-2.5 py-1.5 text-xs font-medium text-foreground">
          {history.length ? "Add a new assessment (previous ones stay in history)" : "Rate this candidate"}
        </summary>
        <form action={saveAssessment} className="space-y-2.5 border-t border-border-c p-2.5">
          <input type="hidden" name="projectId" value={projectId} />
          {RUBRIC_DIMENSIONS.map((dim) => (
            <div key={dim.key}>
              <label className="block text-xs font-medium text-muted">
                {dim.label} <span className="text-muted">({dim.weight}%)</span>
              </label>
              <select
                name={`rating_${dim.key}`}
                defaultValue={latest?.ratings[dim.key] != null ? String(latest.ratings[dim.key]) : "unknown"}
                className="mt-0.5 w-full rounded-md border border-border-c bg-surface px-2 py-1 text-xs"
              >
                {RATING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-muted">Rationale / notes</label>
            <textarea name="notes" rows={2} className="mt-0.5 w-full rounded-md border border-border-c bg-surface px-2 py-1 text-xs" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted">Counterevidence (what would change your mind)</label>
            <textarea name="counterevidence" rows={2} className="mt-0.5 w-full rounded-md border border-border-c bg-surface px-2 py-1 text-xs" />
          </div>
          <input type="hidden" name="evaluator" value="scout" />
          <button type="submit" className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            Save assessment
          </button>
        </form>
      </details>
    </div>
  );
}
