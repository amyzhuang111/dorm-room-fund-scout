// PennApps XXII Devpost gallery. Affiliation stays unverified: a Devpost
// profile has no school field. Bounded walk; re-runs resume via refresh_suggestion.
// Run: npx tsx scripts/ingest/fetch-pennapps-xxii-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_pennapps_xxii_devpost",
  sourceName: "PennApps XXII (Devpost gallery)",
  galleryUrl: "https://pennapps-xxii.devpost.com/project-gallery",
  universityId: "univ_penn",
  eventLabel: "PennApps XXII",
  roleLabel: "PennApps XXII team member",
  maxProjectFetches: 72,
  maxFetches: 80,
  captureLinkedIn: false,
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
