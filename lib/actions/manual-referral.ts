"use server";

import { redirect } from "next/navigation";
import { createManualCandidate, type FounderStatus } from "../domain/manual-candidate";

export async function addManualReferral(formData: FormData) {
  const companyName = String(formData.get("companyName") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const websiteUrl = String(formData.get("websiteUrl") || "").trim() || null;
  const universityId = String(formData.get("universityId") || "").trim();
  const founderNamesRaw = String(formData.get("founderNames") || "").trim();
  const founderStatus = String(formData.get("founderStatus") || "unverified") as FounderStatus;
  const noteBody = String(formData.get("noteBody") || "").trim();
  const referrer = String(formData.get("referrer") || "scout").trim() || "scout";

  if (!companyName || !universityId || !founderNamesRaw || !noteBody) {
    throw new Error("Company name, university, at least one founder, and a firsthand note are all required.");
  }

  const founderNames = founderNamesRaw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  const { projectId } = createManualCandidate({
    companyName,
    description,
    websiteUrl,
    universityId,
    founderNames,
    founderStatus,
    noteBody,
    referrer,
  });

  redirect(`/startup/${projectId}`);
}
