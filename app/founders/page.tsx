import { FoundersDesk } from "@/components/founders-desk";
import { loadFounderTable } from "@/lib/domain/founder-table";

export default function FoundersPage() {
  const count = loadFounderTable().length;
  return (
    <div className="px-6 py-8">
      <h1 className="page-title">Founders</h1>
      <FoundersDesk initialCount={count} />
    </div>
  );
}
