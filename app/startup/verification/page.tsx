import type { Metadata } from "next";
import { VerificationApp } from "@/components/startup-lists-app";
import { listCandidateProjects, listSectorCounts, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";

export const metadata: Metadata = { title: "Startup verification" };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const review = await readReviewState();
  return (
    <VerificationApp
      initial={sp}
      universities={listUniversities()}
      candidates={listCandidateProjects()}
      sectors={listSectorCounts()}
      records={review.records}
      likes={review.likes}
    />
  );
}
