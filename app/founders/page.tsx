import type { Metadata } from "next";
import { FoundersDesk } from "@/components/founders-desk";
import { countFoundersListed } from "@/lib/domain/directory";
import { loadFounderTable } from "@/lib/domain/founder-table";

export const metadata: Metadata = { title: "Founders" };

export default function FoundersPage() {
  const count = loadFounderTable().length;
  return (
    <div className="px-6 py-8">
      <h1 className="page-title">Founders</h1>
      <FoundersDesk initialCount={count} vettedFounders={countFoundersListed()} />
    </div>
  );
}
