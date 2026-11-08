import { programMemberships, sectorMemberships, type ProgramMembership, type SectorMembership } from "@/lib/domain/counted-membership";

export type HomeProgram = ProgramMembership;
export type HomeSector = SectorMembership;

/** Programs people joined. The href opens that counted person list. */
export function loadHomePrograms(limit = 6): HomeProgram[] {
  return programMemberships(limit);
}

/** Sectors ranked by people on eligible companies, not by company count. */
export function loadHomeSectors(limit = 6): HomeSector[] {
  return sectorMemberships(limit);
}
