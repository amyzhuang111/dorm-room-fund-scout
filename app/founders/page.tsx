import { DataTable } from "@/components/data-table";
import { loadFounderTable } from "@/lib/domain/founder-table";

export default function FoundersPage() {
  const rows = loadFounderTable();
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-12">
      <p className="micro">Explore</p>
      <h1 className="page-title">Founders</h1>
      <p className="page-subtitle">{rows.length.toLocaleString("en-US")} founders</p>
      <div className="mt-8">
        <DataTable rows={rows} />
      </div>
    </div>
  );
}
