import { listCampusArcs, listCandidateProjects, listUniversities } from "@/lib/domain/queries";

export function GET() {
  return Response.json({
    universities: listUniversities(),
    arcs: listCampusArcs(),
    candidates: listCandidateProjects(),
  });
}
