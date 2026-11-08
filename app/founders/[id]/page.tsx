import Link from "next/link";
import { notFound } from "next/navigation";
import { campusById, shortCampusLabel } from "@/lib/domain/campuses";
import { loadFounderTable } from "@/lib/domain/founder-table";

export default async function FounderRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const person = loadFounderTable().find((row) => row.id === id);
  if (!person) notFound();
  const campus = person.campusId ? campusById(person.campusId) : undefined;
  const fromMap = sp.from === "map";
  const mapCampus = sp.campus ? campusById(sp.campus) : campus;
  return (
    <article className="mx-auto max-w-3xl px-3 py-4 sm:px-6" data-founder-record={person.id}>
      {fromMap && mapCampus ? (
        <p className="mb-3 text-sm">
          <Link className="text-[color:var(--ember,#C45C12)] underline" href={`/?campus=${encodeURIComponent(mapCampus.id)}`}>
            {`Map, ${mapCampus.shortLabel}`}
          </Link>
        </p>
      ) : (
        <p className="text-sm">
          <Link className="text-[color:var(--cobalt,#2F4FD8)]" href="/founders">Founders</Link>
        </p>
      )}
      <h1 className="mt-2 text-2xl font-semibold">{person.name}</h1>
      <dl className="mt-4 space-y-3 text-sm leading-6">
        <div>
          <dt className="font-semibold">Campus</dt>
          <dd>{person.campusId ? shortCampusLabel(person.campusId, person.campus ?? undefined) : person.campus || "Not on file"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Company</dt>
          <dd>
            {person.companyId && person.company ? (
              <Link className="underline" href={`/startup/${person.companyId}${fromMap && person.campusId ? `?from=map&campus=${encodeURIComponent(person.campusId)}` : ""}`}>
                {person.company}
              </Link>
            ) : (
              "Not on file"
            )}
          </dd>
        </div>
        {person.year != null ? (
          <div>
            <dt className="font-semibold">Class year</dt>
            <dd>{person.year}</dd>
          </div>
        ) : null}
        {person.signal ? (
          <div>
            <dt className="font-semibold">Signal</dt>
            <dd className="[overflow-wrap:anywhere]">{person.signal}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
