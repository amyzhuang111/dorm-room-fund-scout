// TreeHacks 2026 (Devpost gallery) — Stanford's flagship hackathon, tiered
// Founder Scout S / Startup Scout A in lib/domain/source-quality.ts. Same
// shared logic and affiliation-honesty rationale as PennApps — see
// lib/ingest/devpost-hackathon.ts.
// Run: npx tsx scripts/ingest/fetch-treehacks-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_treehacks_devpost",
  sourceName: "TreeHacks 2026 (Devpost gallery)",
  galleryUrl: "https://treehacks-2026.devpost.com/project-gallery",
  universityId: "univ_stanford",
  eventLabel: "TreeHacks 2026",
  roleLabel: "TreeHacks 2026 team member",
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
