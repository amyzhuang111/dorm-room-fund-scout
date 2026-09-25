// PennApps XXVI (Devpost gallery) — see lib/ingest/devpost-hackathon.ts for
// the shared logic and the affiliation-honesty rationale.
// Run: npx tsx scripts/ingest/fetch-pennapps-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_pennapps_devpost",
  sourceName: "PennApps XXVI (Devpost gallery)",
  galleryUrl: "https://pennapps-xxvi.devpost.com/project-gallery",
  universityId: "univ_penn",
  eventLabel: "PennApps XXVI",
  roleLabel: "PennApps XXVI team member",
  // The whole XXVI gallery is about 85 projects. LinkedIn profile fetches
  // are skipped here so one run can cover the gallery; a later run with
  // captureLinkedIn left on can backfill links for people still missing them.
  maxProjectFetches: 90,
  maxFetches: 100,
  captureLinkedIn: false,
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
