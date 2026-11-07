import Link from "next/link";
import { notFound } from "next/navigation";
import { readPersonScope, storedAffiliationLine } from "@/lib/domain/claim-scope";
import { affiliationIsEvent, claimDateNote, companyIdentityNote, presentEnrollment } from "@/lib/domain/founder-people";
import { loadFounderTable } from "@/lib/domain/founder-table";

export default async function FounderRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = loadFounderTable().find((row) => row.id === id);
  if (!person) notFound();
  const present = presentEnrollment(person);
  const scope = readPersonScope({
    name: person.name,
    year: person.year,
    classYearSupport: person.classYearSupport,
    status: person.enrollmentStatus,
    basis: person.enrollmentBasis,
    evidence: person.enrollmentEvidence,
    sourceUrl: person.enrollmentSourceUrl,
    leftSchool: person.leftSchool,
  });
  const identity = companyIdentityNote(person);
  return (
    <article className="mx-auto max-w-3xl overflow-hidden px-3 py-4 sm:px-6" data-founder-record={person.id}>
      <p className="text-sm"><Link className="text-[color:var(--cobalt,#2F4FD8)]" href="/founders">Founders</Link></p>
      <h1 className="mt-2 text-2xl font-semibold">{person.name}</h1>
      <p className="mt-3 text-sm leading-6">{present.summary}</p>
      <dl className="mt-4 space-y-3 text-sm leading-6">
        <div>
          <dt className="font-semibold">Class year</dt>
          <dd className="break-all">{scope.classYearText}{person.leftSchool ? " · left school on record" : ""}</dd>
          {person.enrollmentEvidence ? <dd className="break-all text-fg-2">{person.enrollmentEvidence}</dd> : null}
          {person.enrollmentSourceUrl ? <dd className="break-all"><a className="break-all text-[color:var(--cobalt,#2F4FD8)] underline" href={person.enrollmentSourceUrl}>{person.enrollmentSourceUrl}</a></dd> : null}
          {person.enrollmentStatus ? <dd className="text-fg-2">Stored enrollment field: {person.enrollmentStatus}{person.enrollmentBasis ? ` · basis ${person.enrollmentBasis}` : ""}. That field is not the present enrollment above.</dd> : null}
        </div>
        <div>
          <dt className="font-semibold">Campuses</dt>
          <dd>
            {person.affiliations.length ? (
              <ul className="space-y-2">
                {person.affiliations.map((item, index) => (
                  <li key={`${item.campusId ?? "campus"}-${index}`}>
                    <span className="font-medium">{item.campus || "Campus not on file"}</span>
                    {` · ${storedAffiliationLine(item.role, item.status) || "unknown"}${affiliationIsEvent(item) ? " · not enrollment" : ""}`}
                    {item.excerpt ? <span className="block text-fg-2">{item.excerpt}</span> : null}
                    {claimDateNote(item.excerpt, item.sourceUrl) ? <span className="block text-fg-2">{claimDateNote(item.excerpt, item.sourceUrl)}</span> : null}
                    {item.sourceUrl ? <a className="block break-all text-[color:var(--cobalt,#2F4FD8)] underline" href={item.sourceUrl}>{item.sourceUrl}</a> : null}
                    {item.retrievedAt ? <span className="block text-fg-2">Claim retrieved {item.retrievedAt.slice(0, 10)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              person.campus || "Not on file"
            )}
          </dd>
          <dd className="text-fg-2">A campus that is not listed is not established either way.</dd>
        </div>
        <div>
          <dt className="font-semibold">Company</dt>
          <dd>
            {person.companyId && person.company ? <Link className="text-[color:var(--cobalt,#2F4FD8)] underline" href={`/startup/${person.companyId}`}>{person.company}</Link> : "Not on file"}
            {identity ? <span className="block text-fg-2">{identity}</span> : null}
            {person.companyClaimExcerpt ? <span className="block text-fg-2">{person.companyClaimExcerpt}</span> : null}
            {person.verificationNote ? <span className="block text-fg-2">Stored record note: {person.verificationNote}</span> : null}
          </dd>
        </div>
      </dl>
    </article>
  );
}
