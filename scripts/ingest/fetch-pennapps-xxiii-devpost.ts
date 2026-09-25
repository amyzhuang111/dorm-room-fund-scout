// PennApps XXIII Devpost gallery. Affiliation stays unverified.
// Run: npx tsx scripts/ingest/fetch-pennapps-xxiii-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_pennapps_xxiii_devpost",
  sourceName: "PennApps XXIII (Devpost gallery)",
  galleryUrl: "https://pennapps-xxiii.devpost.com/project-gallery",
  universityId: "univ_penn",
  eventLabel: "PennApps XXIII",
  roleLabel: "PennApps XXIII team member",
  maxProjectFetches: 72,
  maxFetches: 80,
  captureLinkedIn: false,
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
