import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CompanyDetail } from "@/components/company-detail";
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
    <div className="mx-auto w-full max-w-3xl">
      <div className="border-b border-border-c px-4 py-2">
        <Link href="/startup/discover?view=table" className="text-xs font-medium text-link hover:underline">
          All startups
        </Link>
      </div>
      <CompanyDetail project={project} initialCard={getStartupCard(project.id)} />
    </div>
  );
}
