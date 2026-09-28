import { addNote } from "@/lib/actions/notes";
import type { ManualNote } from "@/lib/domain/queries";

export function NotesSection({ entityType, entityId, notes }: { entityType: string; entityId: string; notes: ManualNote[] }) {
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border border-border-c bg-surface-2 p-2 text-sm">
            <p className="text-foreground">{n.body}</p>
            <p className="mt-1 text-[11px] text-muted">
              {n.author} · {n.createdAt.slice(0, 10)}
            </p>
          </li>
        ))}
        {notes.length === 0 && <p className="text-sm text-muted">No notes yet — analyst inferences and hunches belong here, labeled as yours, not as evidence.</p>}
      </ul>
      <form action={addNote} className="flex gap-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="author" value="scout" />
        <textarea
          name="body"
          placeholder="Add a note (your own inference or reminder — kept separate from sourced evidence)"
          rows={2}
          required
          className="flex-1 rounded-md border border-border-c bg-surface px-2 py-1 text-xs"
        />
        <button type="submit" className="self-start rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          Add
        </button>
      </form>
    </div>
  );
}
