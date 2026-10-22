import { DataTable } from "@/components/data-table";
import { loadFounderTable } from "@/lib/domain/founder-table";

export default function FoundersPage() {
  const rows = loadFounderTable();
  return (
    <div className="px-6 py-8">
      <h1 className="page-title">Founders</h1>
      <p className="mt-2 text-[14px] text-fg-2"><span className="num">{rows.length.toLocaleString("en-US")}</span> founders</p>
      <div className="mt-8">
        <DataTable rows={rows} />
      </div>
    </div>
  );
}
