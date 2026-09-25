"use client";

import { useState } from "react";
import { domainKey, matchesFeedback, nameKey, type FeedbackEntityType } from "@/lib/domain/feedback";
import { useFeedback } from "./feedback-provider";

export function FeedbackControls({
  entityType,
  entityId,
  name,
  url,
}: {
  entityType: FeedbackEntityType;
  entityId: string;
  name: string;
  url?: string | null;
}) {
  const { records, setAction, setNote } = useFeedback();
  const target = { entityType, entityId, name, domain: domainKey(url) };
  const current = records.find((r) => matchesFeedback(r, target));
  const [noteOpen, setNoteOpen] = useState(false);
  const base = {
    entityType,
    entityId,
    nameKey: nameKey(name),
    domainKey: domainKey(url),
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {(["like", "pass", "hide"] as const).map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => setAction({ ...base, action, note: current?.note })}
          className={`rounded-full border px-2 py-0.5 text-[11px] ${
            current?.action === action
              ? action === "hide"
                ? "border-danger/30 bg-danger-bg text-danger"
                : action === "pass"
                  ? "border-warn/30 bg-warn-bg text-warn"
                  : "border-ok/30 bg-ok-bg text-ok"
              : "border-border-c text-muted hover:border-foreground/20 hover:bg-surface hover:text-foreground"
          }`}
        >
          {action === "like" ? "Like" : action === "pass" ? "Pass" : "Never show again"}
        </button>
      ))}
      <button type="button" onClick={() => setNoteOpen((v) => !v)} className="text-[11px] text-link underline">
        Note
      </button>
      {current?.note && <p className="w-full text-[11px] text-muted">{current.note}</p>}
      {noteOpen && (
        <input
          defaultValue={current?.note ?? ""}
          placeholder="Note"
          className="w-full rounded-md border border-border-c bg-surface px-2 py-1 text-[11px]"
          onBlur={(e) => {
            if (!current) setAction({ ...base, action: "like", note: e.target.value });
            else setNote(base, e.target.value);
          }}
        />
      )}
    </div>
  );
}

export function FeedbackUndo({
  entityType,
  entityId,
  name,
  url,
}: {
  entityType: FeedbackEntityType;
  entityId: string;
  name: string;
  url?: string | null;
}) {
  const { undo } = useFeedback();
  return (
    <button
      type="button"
      className="text-[11px] text-link underline"
      onClick={() => undo({ entityType, entityId, name, domain: domainKey(url) })}
    >
      Undo
    </button>
  );
}
