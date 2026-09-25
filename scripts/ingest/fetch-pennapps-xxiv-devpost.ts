// PennApps XXIV Devpost gallery. Affiliation stays unverified.
// Run: npx tsx scripts/ingest/fetch-pennapps-xxiv-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_pennapps_xxiv_devpost",
  sourceName: "PennApps XXIV (Devpost gallery)",
  galleryUrl: "https://pennapps-xxiv.devpost.com/project-gallery",
  universityId: "univ_penn",
  eventLabel: "PennApps XXIV",
  roleLabel: "PennApps XXIV team member",
  maxProjectFetches: 72,
  maxFetches: 80,
  captureLinkedIn: false,
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
