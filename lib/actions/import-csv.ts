"use server";

import { redirect } from "next/navigation";
import { parseCsv } from "../ingest/csv";
import { listUniversities } from "../domain/queries";
import { createManualCandidate, type FounderStatus } from "../domain/manual-candidate";

const EXPECTED_HEADER = ["companyName", "description", "websiteUrl", "universityName", "founderNames", "founderStatus", "noteBody", "referrer"];
const VALID_STATUSES: FounderStatus[] = ["current_student", "recent_grad", "older_alumni", "unverified"];

export async function importReferralsCsv(formData: FormData) {
  const file = formData.get("csvFile");
  if (!(file instanceof File)) {
    redirect(`/sources?importError=${encodeURIComponent("No file uploaded.")}`);
  }
  const text = await (file as File).text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    redirect(`/sources?importError=${encodeURIComponent("CSV was empty.")}`);
  }

  const header = rows[0].map((h) => h.trim());
  const missingCols = EXPECTED_HEADER.filter((c) => !header.includes(c));
  if (missingCols.length > 0) {
    redirect(
      `/sources?importError=${encodeURIComponent(
        `Missing column(s): ${missingCols.join(", ")}. Expected header: ${EXPECTED_HEADER.join(",")}`
      )}`
    );
  }

  const colIndex = (name: string) => header.indexOf(name);
  const universities = listUniversities();
  const uniByName = new Map(universities.map((u) => [u.name.toLowerCase(), u.id]));

  let created = 0;
  const skipped: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (col: string) => (row[colIndex(col)] ?? "").trim();

    const companyName = get("companyName");
    const universityName = get("universityName");
    const founderNamesRaw = get("founderNames");
    const noteBody = get("noteBody");
    const referrer = get("referrer") || "scout";
    const statusRaw = get("founderStatus").toLowerCase() as FounderStatus;
    const founderStatus: FounderStatus = VALID_STATUSES.includes(statusRaw) ? statusRaw : "unverified";

    if (!companyName || !universityName || !founderNamesRaw || !noteBody) {
      skipped.push(`Row ${r + 1} (${companyName || "unnamed"}): missing a required field.`);
      continue;
    }
    const universityId = uniByName.get(universityName.toLowerCase());
    if (!universityId) {
      skipped.push(`Row ${r + 1} (${companyName}): university "${universityName}" doesn't match any known campus — not guessed.`);
      continue;
    }
    const founderNames = founderNamesRaw
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (founderNames.length === 0) {
      skipped.push(`Row ${r + 1} (${companyName}): no founder names parsed.`);
      continue;
    }

    createManualCandidate({
      companyName,
      description: get("description") || null,
      websiteUrl: get("websiteUrl") || null,
      universityId,
      founderNames,
      founderStatus,
      noteBody,
      referrer,
    });
    created++;
  }

  const params = new URLSearchParams({ imported: String(created), skipped: String(skipped.length) });
  if (skipped.length > 0) params.set("skippedDetail", skipped.slice(0, 10).join(" | "));
  redirect(`/sources?${params.toString()}`);
}
