import Link from "next/link";
import { listPipelineEntries } from "@/lib/domain/queries";
import { updatePipelineEntry } from "@/lib/actions/pipeline";
import { getDb } from "@/lib/db/client";
import { readReviewState } from "@/lib/domain/review-server";
import { domainKey, isHidden } from "@/lib/domain/feedback";

const STAGES = ["New", "Researching", "Contact planned", "Contacted", "Meeting", "Diligence", "Passed"];

function PipelineCard({ e }: { e: ReturnType<typeof listPipelineEntries>[number] }) {
  const step = e.next_action || (e.blocker ? `Blocker: ${e.blocker}` : null);
  return (
    <Link
      href={`/startup/discover?project=${e.project_id}`}
      className="block rounded-md border border-border-c bg-surface p-2.5 text-xs hover:border-accent"
    >
      <p className="font-medium text-foreground">{e.project_name}</p>
      <p className="mt-0.5 text-muted">{e.campus_name ?? "Campus unknown"}</p>
      {step && <p className="mt-1.5 text-foreground">{step}</p>}
      {e.due_date && <p className="mt-0.5 text-muted">Due {e.due_date}</p>}
    </Link>
  );
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "board";
  const review = await readReviewState();
  const hiddenCompany = (id: string, name: string, url: string | null) =>
    isHidden(review.records, { entityType: "project", entityId: id, name, domain: domainKey(url) });
  const entries = listPipelineEntries().filter((e) => !hiddenCompany(e.project_id, e.project_name, null));
  const withEntries = new Set(entries.map((e) => e.project_id));

  const db = getDb();
  let noEntry = (
    db.prepare(`SELECT id, name, website_url, primary_link FROM projects WHERE kind='company' AND is_investable_candidate=1 ORDER BY name`).all() as {
      id: string;
      name: string;
      website_url: string | null;
      primary_link: string | null;
    }[]
  ).filter((p) => !withEntries.has(p.id) && !hiddenCompany(p.id, p.name, p.website_url || p.primary_link));

  if (sp.q) {
    const q = sp.q.toLowerCase();
    noEntry = noEntry.filter((p) => p.name.toLowerCase().includes(q));
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Pipeline</h1>
          <p className="mt-1 text-sm text-muted">
            Workflow status, separate from eligibility/ranking queues — a company can be &quot;Meeting&quot; regardless of its screening
            gate result. Set status from a company&apos;s detail panel in Discover.
          </p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-md border border-border-c bg-surface p-0.5">
          {(["board", "table"] as const).map((v) => (
            <Link
              key={v}
              href={`/startup/pipeline?view=${v}`}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                view === v ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      {view === "board" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((status) => {
            const list = entries.filter((e) => e.status === status);
            return (
              <div key={status}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  {status} <span className="font-normal">({list.length})</span>
                </p>
                <div className="space-y-1.5">
                  {list.map((e) => (
                    <PipelineCard key={e.project_id} e={e} />
                  ))}
                  {list.length === 0 && <p className="text-xs text-muted">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border border-border-c">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Campus</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Next step</th>
                <th className="px-3 py-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.project_id} className="border-t border-border-c">
                  <td className="px-3 py-2">
                    <Link href={`/startup/discover?project=${e.project_id}`} className="font-medium text-foreground hover:underline">
                      {e.project_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted">{e.campus_name ?? "—"}</td>
                  <td className="px-3 py-2 text-foreground">{e.status}</td>
                  <td className="px-3 py-2 text-muted">{e.next_action || (e.blocker ? `Blocker: ${e.blocker}` : "—")}</td>
                  <td className="px-3 py-2 text-muted">{e.due_date ?? "—"}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-muted">
                    Nothing in the pipeline yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Not yet in pipeline ({noEntry.length})</p>
          <form action="/startup/pipeline" method="get" className="flex items-center gap-2">
            {view === "table" && <input type="hidden" name="view" value="table" />}
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search companies…"
              className="rounded-md border border-border-c bg-surface px-2.5 py-1 text-xs placeholder:text-muted"
            />
          </form>
        </div>
        <div className="mt-2 overflow-x-auto rounded-md border border-border-c">
          <table className="w-full text-left text-sm">
            <tbody>
              {noEntry.slice(0, 100).map((p) => (
                <tr key={p.id} className="border-t border-border-c first:border-t-0">
                  <td className="px-3 py-1.5">
                    <Link href={`/startup/discover?project=${p.id}`} className="text-foreground hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <form action={updatePipelineEntry}>
                      <input type="hidden" name="projectId" value={p.id} />
                      <input type="hidden" name="status" value="New" />
                      <button type="submit" className="text-xs font-medium text-link hover:underline">
                        Add to pipeline
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {noEntry.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-sm text-muted">Every company candidate is already tracked.</td>
                </tr>
              )}
            </tbody>
          </table>
          {noEntry.length > 100 && (
            <p className="border-t border-border-c px-3 py-1.5 text-xs text-muted">Showing first 100 — narrow with search above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
