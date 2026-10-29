import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CompanyDetail } from "@/components/company-detail";
import { SampleTheme } from "@/components/sample-theme";
import { UserStartupPage } from "@/components/user-startup-page";
import { survivorId } from "@/lib/domain/entity-redirects";
import { getProjectDetail } from "@/lib/domain/queries";
import { getStartupCard } from "@/lib/domain/startup-card";

export default async function StartupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.startsWith("user_")) return <UserStartupPage id={id} />;
  const merged = survivorId("project", id);
  if (merged) permanentRedirect(`/startup/${merged}`);
  const project = getProjectDetail(id);
  if (!project) notFound();
  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]">
      <SampleTheme />
      <div className="mx-auto w-full max-w-3xl">
        <div className="border-b border-line px-4 py-2">
          <Link href="/?sample=1#browse" className="text-xs font-medium text-link hover:underline">
            All startups
          </Link>
        </div>
        <CompanyDetail project={project} initialCard={getStartupCard(project.id)} />
      </div>
    </div>
  );
}
