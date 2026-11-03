import { FoundersDesk } from "@/components/founders-desk";
import { OpenLaneFounders } from "@/components/open-lane-founders";
import { loadFounderTable } from "@/lib/domain/founder-table";

export default async function FoundersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const lane = (sp.lane || "").trim().toLowerCase();
  const campus = (sp.campus || "").trim() || undefined;

  if (lane === "open") {
    return (
      <div className="px-6 py-8" data-founders-lane="open">
        <h1 className="page-title">Founders</h1>
        <OpenLaneFounders campusId={campus || null} />
      </div>
    );
  }

  const count = loadFounderTable(campus).length;
  return (
    <div className="px-6 py-8" data-founders-lane="all">
      <h1 className="page-title">Founders</h1>
      <FoundersDesk initialCount={count} campusId={campus} campusLocked={Boolean(campus)} />
    </div>
  );
}
