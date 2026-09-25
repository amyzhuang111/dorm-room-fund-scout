// PennApps XXV "Deep Sea Edition" (Devpost gallery) — the prior cohort to
// PennApps XXVI, which is already near-fully walked (83/85). Added as a
// second real Penn source since PennApps XXVI itself has no more real
// growth left; PennHacks (the old separate hardware hackathon) merged
// into PennApps itself years ago and has no standalone current gallery
// (verified via search, not assumed). One cohort back is still real,
// current-ish students, not stretching "most recent" too far.
// Run: npx tsx scripts/ingest/fetch-pennapps-xxv-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_pennapps_xxv_devpost",
  sourceName: "PennApps XXV (Devpost gallery)",
  galleryUrl: "https://pennapps-xxv.devpost.com/project-gallery",
  universityId: "univ_penn",
  eventLabel: "PennApps XXV",
  roleLabel: "PennApps XXV team member",
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
