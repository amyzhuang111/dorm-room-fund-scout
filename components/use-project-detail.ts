"use client";

import { useEffect, useState } from "react";
import { emptyCompanyProfile } from "@/lib/domain/company-profile";
import type { CandidateSummary, ProjectDetail } from "@/lib/domain/queries";

export function projectShell(candidate: CandidateSummary, detail: ProjectDetail | null): ProjectDetail {
  if (detail?.id === candidate.id) return detail;
  return { ...candidate, profile: emptyCompanyProfile(), claims: [], signals: [], pipeline: null, manualNotes: [], assessmentHistory: [] };
}

export function useProjectDetail(id: string | undefined, initial: ProjectDetail | null): ProjectDetail | null {
  const [detail, setDetail] = useState<ProjectDetail | null>(initial && initial.id === id ? initial : null);
  const [forId, setForId] = useState(id);
  if (id !== forId) {
    setForId(id);
    setDetail(initial?.id === id ? initial : null);
  }

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    const load = () => {
      fetch(`/api/project/${encodeURIComponent(id)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: ProjectDetail | null) => {
          if (!cancel && data) setDetail(data);
        })
        .catch(() => {});
    };
    load();
    const onSubmit = () => window.setTimeout(load, 400);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      cancel = true;
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [id, initial]);

  return detail;
}
