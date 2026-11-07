import { formatCorpusDate } from "../display/corpus-date";
import type { CorpusRow } from "./corpus-explorer";

export interface LabeledField {
  label: string;
  value: string;
}

/** Stored corpus fields for a phone card. Empty values are omitted. Stage is not repeated as Signal. */
export function corpusLabeledFields(row: CorpusRow): LabeledField[] {
  const fields: LabeledField[] = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value == null) return;
    const text = String(value).trim();
    if (!text) return;
    if (fields.some((field) => field.label === label)) return;
    if (label === "Signal" && fields.some((field) => field.label === "Stage" && field.value === text)) return;
    fields.push({ label, value: text });
  };
  add("Campus", row.campus);
  add("Scouting status", row.scoutingStatus);
  if (row.kind && row.kind !== "company") add("Record", row.kind);
  add("Evidence", row.verification);
  add("Stage", row.stage);
  add("Signal", row.signalLabel);
  add("Sector", row.sector);
  add("Founded", formatCorpusDate(row.foundedYear));
  if (row.signals > 0) add("Signals", row.signals.toLocaleString("en-US"));
  add("Latest signal", formatCorpusDate(row.latestSignalAt));
  add("Program", row.primaryProgram);
  add("YC", row.ycBatch);
  if (row.founderCount > 0) add("Team", row.founderCount.toLocaleString("en-US"));
  add("Funding", row.fundingText);
  return fields;
}
