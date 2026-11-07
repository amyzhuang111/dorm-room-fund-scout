import { permanentRedirect } from "next/navigation";

export default async function CompanyRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/startup/${id}`);
}
