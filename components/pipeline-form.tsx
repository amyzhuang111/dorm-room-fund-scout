import { updatePipelineEntry } from "@/lib/actions/pipeline";

const STATUSES = ["New", "Researching", "Contact planned", "Contacted", "Meeting", "Diligence", "Passed"];

export function PipelineForm({
  projectId,
  pipeline,
}: {
  projectId: string;
  pipeline: { status: string; nextAction: string | null; dueDate: string | null; notes: string | null; passReason: string | null } | null;
}) {
  return (
    <form action={updatePipelineEntry} className="mt-1 space-y-2 rounded-md border border-border-c p-2.5">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap gap-2">
        <select
          name="status"
          defaultValue={pipeline?.status ?? "New"}
          className="rounded-md border border-border-c bg-surface px-2 py-1 text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="dueDate"
          defaultValue={pipeline?.dueDate ?? ""}
          className="rounded-md border border-border-c bg-surface px-2 py-1 text-xs"
        />
      </div>
      <input
        type="text"
        name="nextAction"
        defaultValue={pipeline?.nextAction ?? ""}
        placeholder="Next action (e.g. intro request, specific question)"
        className="w-full rounded-md border border-border-c bg-surface px-2 py-1 text-xs"
      />
      <textarea
        name="notes"
        defaultValue={pipeline?.notes ?? ""}
        placeholder="Notes (preserved across refreshes)"
        rows={2}
        className="w-full rounded-md border border-border-c bg-surface px-2 py-1 text-xs"
      />
      <input
        type="text"
        name="passReason"
        defaultValue={pipeline?.passReason ?? ""}
        placeholder="Pass reason (only relevant if status = Passed)"
        className="w-full rounded-md border border-border-c bg-surface px-2 py-1 text-xs"
      />
      <button type="submit" className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
        Save
      </button>
    </form>
  );
}
