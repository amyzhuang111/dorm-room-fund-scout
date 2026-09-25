// UC Berkeley AI Hackathon 2026 (Devpost gallery) — "the world's largest
// AI Hackathon," hosted by Hackathons @ Berkeley (the same team behind Cal
// Hacks) and Berkeley SkyDeck, held June 2026. A second real Berkeley
// hackathon source beyond Cal Hacks (which is already near-fully walked,
// 696/699) — found by searching for other real Berkeley Devpost galleries
// rather than assumed to exist. Not in lib/domain/source-quality.ts's
// SOURCE_CATALOGUE yet (that file's Berkeley section only anticipated Cal
// Hacks by name) — worth adding there in a follow-up pass; this script can
// run standalone in the meantime, same as any other cat_*-less adapter.
// Run: npx tsx scripts/ingest/fetch-ucb-ai-hackathon-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_ucb_ai_hackathon_devpost",
  sourceName: "UC Berkeley AI Hackathon 2026 (Devpost gallery)",
  galleryUrl: "https://ai-hackathon-2026.devpost.com/project-gallery",
  universityId: "univ_berkeley",
  eventLabel: "UC Berkeley AI Hackathon 2026",
  roleLabel: "UC Berkeley AI Hackathon 2026 team member",
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
