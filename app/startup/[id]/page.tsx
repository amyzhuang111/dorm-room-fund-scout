import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyDetail } from "@/components/company-detail";
import { getProjectDetail } from "@/lib/domain/queries";

export default async function StartupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProjectDetail(id);
  if (!project) notFound();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="border-b border-border-c px-4 py-2">
        <Link href="/startup/discover?view=table" className="text-xs font-medium text-link hover:underline">
          All startups
        </Link>
      </div>
      <CompanyDetail project={project} />
    </div>
  );
}
