// Berkeley Blockchain Hackathon (Devpost gallery) — co-hosted by Node and
// Blockchain at Berkeley, $20k prize pool, DeFi-focused. A third real
// Berkeley hackathon source (alongside Cal Hacks and the UC Berkeley AI
// Hackathon), found by the same web search that surfaced the AI hackathon
// — not assumed to exist.
// Run: npx tsx scripts/ingest/fetch-berkeley-blockchain-devpost.ts
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

ingestDevpostHackathon({
  sourceId: "src_berkeley_blockchain_devpost",
  sourceName: "Berkeley Blockchain Hackathon (Devpost gallery)",
  galleryUrl: "https://hackberkeley.devpost.com/project-gallery",
  universityId: "univ_berkeley",
  eventLabel: "Berkeley Blockchain Hackathon",
  roleLabel: "Berkeley Blockchain Hackathon team member",
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
