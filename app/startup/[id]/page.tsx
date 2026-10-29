import { notFound, permanentRedirect } from "next/navigation";
import { CompanyDetail } from "@/components/company-detail";
import { SampleCompanyShell } from "@/components/sample-company-shell";
import { UserStartupPage } from "@/components/user-startup-page";
import { loadDirectory } from "@/lib/domain/directory";
import { survivorId } from "@/lib/domain/entity-redirects";
import { loadHeroStats } from "@/lib/domain/hero-stats";
import { getProjectDetail } from "@/lib/domain/queries";
import { getStartupCard } from "@/lib/domain/startup-card";

export default async function StartupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.startsWith("user_")) return <UserStartupPage id={id} />;
  const merged = survivorId("project", id);
  if (merged) permanentRedirect(`/startup/${merged}`);
  const project = getProjectDetail(id);
  if (!project) notFound();
  const data = loadDirectory();
  const companies = data.cards.map((card) => ({
    id: card.id,
    name: card.name,
    schoolId: card.schoolId,
    school: card.school,
    signals: card.signals,
    logoUrl: card.logoUrl,
    founders: card.founders,
    sectorId: card.sectorId,
    sector: card.sector,
    stage: card.stage,
    signalKind: card.signalKind,
    signalLabel: card.signalLabel,
    latestSignalAt: card.latestSignalAt,
  }));
  const campuses = loadHeroStats().universities
    .filter((university) => university.lat != null && university.lon != null)
    .map((university) => ({
      id: university.id,
      name: university.name,
      country: university.country?.trim() || "Unknown",
      founders: university.founderCount,
    }));
  return (
    <SampleCompanyShell companies={companies} campuses={campuses}>
      <CompanyDetail project={project} initialCard={getStartupCard(project.id)} />
    </SampleCompanyShell>
  );
}
