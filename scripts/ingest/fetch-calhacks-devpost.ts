// Cal Hacks 12.0 (Devpost gallery) — Berkeley's flagship hackathon, tiered
// Founder Scout S / Startup Scout A in lib/domain/source-quality.ts. Same
// shared logic and affiliation-honesty rationale as PennApps/TreeHacks — see
// lib/ingest/devpost-hackathon.ts.
// Run: npx tsx scripts/ingest/fetch-calhacks-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_calhacks_devpost",
  sourceName: "Cal Hacks 12.0 (Devpost gallery)",
  galleryUrl: "https://cal-hacks-12-0.devpost.com/project-gallery",
  universityId: "univ_berkeley",
  eventLabel: "Cal Hacks 12.0",
  roleLabel: "Cal Hacks 12.0 team member",
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
