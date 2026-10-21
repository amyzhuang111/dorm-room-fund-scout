import Link from "next/link";
import { campusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import { listUniversities } from "@/lib/domain/queries";

export default function CampusesPage() {
  const rows = listUniversities()
    .map((university) => ({
      ...university,
      label: shortCampusLabel(university.id, university.name),
      slug: campusSlug(shortCampusLabel(university.id, university.name)),
    }))
    .sort((a, b) => b.founderCount - a.founderCount || a.label.localeCompare(b.label));
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-12">
      <p className="micro">Explore</p>
      <h1 className="page-title">Campuses</h1>
      <p className="page-subtitle">{rows.filter((row) => row.founderCount > 0).length.toLocaleString("en-US")} campuses have at least one promoted founder.</p>
      <table className="mt-8 w-full text-left text-[14px]">
        <thead className="micro sticky top-14 bg-sunken">
          <tr>
            <th className="py-2 font-medium">Campus</th>
            <th className="py-2 text-right font-medium">Founders</th>
            <th className="py-2 text-right font-medium">Companies</th>
            <th className="py-2 text-right font-medium">Sources</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-line">
              <td className="py-2">
                <Link href={`/campuses/${row.slug}`} className="text-fg hover:text-cobalt">{row.label}</Link>
                {row.country ? <span className="ml-2 text-fg-3">{row.country}</span> : null}
              </td>
              <td className="num py-2 text-right">{row.founderCount.toLocaleString("en-US")}</td>
              <td className="num py-2 text-right">{row.companyCount.toLocaleString("en-US")}</td>
              <td className="num py-2 text-right">{row.sourcesConfigured.toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
