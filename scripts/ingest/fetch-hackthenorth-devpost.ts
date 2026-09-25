// Hack the North 2026 (Devpost gallery) — Canada's largest hackathon,
// hosted at Waterloo. Closes cat_hackthenorth (previously unconfigured,
// no dbSourceId assigned — this adapter assigns src_hackthenorth_devpost).
// Uses the most recent completed event (2026, not 2025) — same "most
// recent cohort" precedent as MIT delta v/Velocity. See
// lib/ingest/devpost-hackathon.ts for the shared logic, including the
// 2026-09-25 addition of personal-LinkedIn capture from each new team
// member's own Devpost profile page.
// Run: npx tsx scripts/ingest/fetch-hackthenorth-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_hackthenorth_devpost",
  sourceName: "Hack the North 2026 (Devpost gallery)",
  galleryUrl: "https://hackthenorth2026.devpost.com/project-gallery",
  universityId: "univ_waterloo",
  eventLabel: "Hack the North 2026",
  roleLabel: "Hack the North 2026 team member",
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
