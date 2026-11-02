import { notFound, permanentRedirect } from "next/navigation";
import { CompanyDetail } from "@/components/company-detail";
import { SampleCompanyShell } from "@/components/sample-company-shell";
import { UserStartupPage } from "@/components/user-startup-page";
import { loadDirectory, type DirectoryCard } from "@/lib/domain/directory";
import { survivorId } from "@/lib/domain/entity-redirects";
import { loadHeroStats } from "@/lib/domain/hero-stats";
import { getProjectDetail } from "@/lib/domain/queries";
import { isBoilerplateDescription } from "@/lib/domain/sectors";
import { getStartupCard } from "@/lib/domain/startup-card";
import { campusPeerCompanies, type FacetCompany } from "@/lib/domain/sample-facets";

function toFacetCompany(card: DirectoryCard): FacetCompany {
  return {
    id: card.id,
    name: card.name,
    schoolId: card.schoolId,
    signals: card.signals,
    logoUrl: card.logoUrl,
    founders: card.founders,
    sectorId: card.sectorId,
    sector: card.sector,
    signalKind: card.signalKind,
    signalLabel: card.signalLabel,
    latestSignalAt: card.latestSignalAt,
  };
}

/** Drop bulky fields the wire/FacetRail seed do not need before the catalog loads. */
function slimWireCard(card: FacetCompany): FacetCompany {
  return {
    id: card.id,
    name: card.name,
    schoolId: card.schoolId,
    signals: card.signals,
    sectorId: card.sectorId,
    sector: card.sector,
    signalKind: card.signalKind,
    signalLabel: card.signalLabel,
    latestSignalAt: card.latestSignalAt,
  };
}

/** Peers for the dossier wire only - never the full 2,513-card directory. */
function wireSeedCompanies(all: FacetCompany[], schoolId: string | null, sectorId: string | null): FacetCompany[] {
  let peers: FacetCompany[] = [];
  if (schoolId) {
    peers = campusPeerCompanies(all, schoolId);
  }
  if (!peers.length && sectorId) {
    peers = all.filter((c) => c.sectorId === sectorId);
  }
  if (!peers.length) {
    peers = all.filter((c) => (c.signals ?? 0) > 0).slice(0, 40);
  }
  // Wire UI shows a short strip + boards; keep HTML under 210 KiB.
  const ranked = [...peers].sort(
    (a, b) => (b.signals ?? 0) - (a.signals ?? 0) || a.name.localeCompare(b.name)
  );
  return ranked.slice(0, 48).map(slimWireCard);
}

export default async function StartupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.startsWith("user_")) return <UserStartupPage id={id} />;
  const merged = survivorId("project", id);
  if (merged) permanentRedirect(`/startup/${merged}`);
  const project = getProjectDetail(id);
  if (!project) notFound();
  const data = loadDirectory();
  const all = data.cards.map(toFacetCompany);
  const campuses = loadHeroStats().universities
    .filter((university) => university.lat != null && university.lon != null)
    .map((university) => ({
      id: university.id,
      name: university.name,
      country: university.country?.trim() || "Unknown",
      founders: university.founderCount,
    }));
  const card = getStartupCard(project.id);
  const directoryRow = data.cards.find((row) => row.id === project.id);
  const pitchSource = [card?.description, project.profile.description?.text, project.description]
    .map((v) => (v || "").replace(/\s+/g, " ").trim())
    .find((v) => v && !isBoilerplateDescription(v)) || "";
  const pitch = pitchSource
    ? (pitchSource.split(/(?<=[.!?])\s+/)[0] || pitchSource).slice(0, 160).trim()
    : null;
  const stage =
    directoryRow?.stage ??
    project.profile.rounds[0]?.stage ??
    null;
  const dossier = {
    name: card?.name ?? project.name,
    campus: card?.campuses?.[0] ?? directoryRow?.school ?? null,
    year: directoryRow?.foundedYear ?? null,
    schoolId: directoryRow?.schoolId ?? null,
    sectorId: directoryRow?.sectorId ?? null,
    sector: directoryRow?.sector ?? null,
    primaryProgram: directoryRow?.primaryProgram ?? null,
    founders: directoryRow?.founders ?? [],
    signals: directoryRow?.signals ?? 0,
    operatingStatus: directoryRow?.operatingStatus ?? null,
    latestSignalAt: directoryRow?.latestSignalAt ?? null,
    logoUrl: directoryRow?.logoUrl ?? null,
    pitch: pitch || null,
    stage,
    signalLabel: directoryRow?.signalLabel ?? null,
  };
  const companies = wireSeedCompanies(all, dossier.schoolId, dossier.sectorId);
  return (
    <SampleCompanyShell companies={companies} campuses={campuses} dossier={dossier}>
      <CompanyDetail project={project} initialCard={card} />
    </SampleCompanyShell>
  );
}
