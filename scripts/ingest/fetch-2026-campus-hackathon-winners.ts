// Bounded 2026 hackathon build-evidence import. These are *projects*, not
// startup company records. Each person is linked as a Devpost team_member,
// and the host university affiliation remains explicitly unverified.
// The per-event source IDs are distinct from earlier 2025/2026 crawls.
// Pages/fetches are capped to avoid hammering Devpost.
import { ingestDevpostHackathon } from "../../lib/ingest/devpost-hackathon";

const EVENTS = [
  {
    sourceId: "src_treehacks26_winners",
    sourceName: "TreeHacks 2026 Devpost prize teams",
    galleryUrl: "https://treehacks-2026.devpost.com/project-gallery",
    universityId: "univ_stanford",
    eventLabel: "TreeHacks 2026 prize teams",
    roleLabel: "TreeHacks 2026 prize-winning project team member",
  },
  {
    sourceId: "src_calhacks13_devpost",
    sourceName: "Cal Hacks 13.0 (2026) prize teams",
    galleryUrl: "https://cal-hacks-13-0.devpost.com/project-gallery",
    universityId: "univ_berkeley",
    eventLabel: "Cal Hacks 13.0 (2026)",
    roleLabel: "Cal Hacks 13.0 2026 project team member",
  },
  {
    sourceId: "src_hackprinceton_spring26",
    sourceName: "HackPrinceton Spring 2026 prize teams",
    galleryUrl: "https://hackprinceton-spring-26.devpost.com/project-gallery",
    universityId: "univ_princeton",
    eventLabel: "HackPrinceton Spring 2026",
    roleLabel: "HackPrinceton Spring 2026 project team member",
  },
  {
    sourceId: "src_hackharvard26_devpost",
    sourceName: "HackHarvard 2026 prize teams",
    galleryUrl: "https://hackharvard2026.devpost.com/project-gallery",
    universityId: "univ_harvard",
    eventLabel: "HackHarvard 2026",
    roleLabel: "HackHarvard 2026 project team member",
  },
  {
    sourceId: "src_hackillinois26_devpost",
    sourceName: "HackIllinois 2026 prize teams",
    galleryUrl: "https://hackillinois-2026.devpost.com/project-gallery",
    universityId: "univ_uiuc",
    eventLabel: "HackIllinois 2026",
    roleLabel: "HackIllinois 2026 project team member",
  },
] as const;

async function main() {
  for (const event of EVENTS) {
    console.log("\n======== " + event.sourceName + " ========");
    await ingestDevpostHackathon({
      ...event,
      winnersOnly: true,
      captureLinkedIn: false, // avoid extra profile fetches on this bounded first pass
      maxProjectFetches: 24,
      maxFetches: 90,
    });
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
