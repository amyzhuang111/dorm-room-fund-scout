import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import type { ConnectorLists } from "@/lib/domain/connectors";

export function TopConnectors({
  lists,
  activeCampus,
  basePath,
  current,
}: {
  lists: ConnectorLists;
  activeCampus: string | null;
  basePath: string;
  current: Record<string, string | undefined>;
}) {
  return (
    <div className="mt-4 space-y-5">
      <p className="text-sm text-muted">
        People and clubs linked to verified, tiered founders. A link is a co-founder tie, a shared company, or a shared club of at most 80 members. Clubs are ordered by strong founders per member. Clubs with fewer than 5 members are left off so a one-person group does not rank first.
      </p>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Link href={buildHref(basePath, current, { university: null })} className={`rounded-full border px-2 py-0.5 ${!activeCampus ? "border-foreground bg-foreground text-white" : "border-border-c text-foreground"}`}>
          All campuses
        </Link>
        {lists.campuses.map((campus) => (
          <Link
            key={campus.id}
            href={buildHref(basePath, current, { university: activeCampus === campus.id ? null : campus.id })}
            className={`rounded-full border px-2 py-0.5 ${activeCampus === campus.id ? "border-accent bg-accent text-accent-foreground" : "border-border-c text-muted"}`}
          >
            {campus.name}
          </Link>
        ))}
      </div>
      <section>
        <h2 className="text-sm font-semibold text-foreground">People</h2>
        <ol className="mt-2 space-y-2">
          {lists.people.map((person, index) => (
            <li key={person.id} className="rounded-md border border-border-c bg-surface p-3 text-sm">
              <Link href={person.href} className="font-medium text-foreground hover:text-link">
                {index + 1}. {person.name}
              </Link>
              <p className="mt-0.5 text-xs text-muted">
                {person.campusName ?? "Campus not on record"} · {person.strongFounders} strong {person.strongFounders === 1 ? "founder" : "founders"}
              </p>
            </li>
          ))}
          {lists.people.length === 0 && <li className="text-sm text-muted">No people on this campus meet the bar.</li>}
        </ol>
      </section>
      <section>
        <h2 className="text-sm font-semibold text-foreground">Clubs and programs</h2>
        <ol className="mt-2 space-y-2">
          {lists.clubs.map((club, index) => (
            <li key={club.id} className="rounded-md border border-border-c bg-surface p-3 text-sm">
              <p className="font-medium text-foreground">
                {index + 1}. {club.href ? (
                  <a href={club.href} target="_blank" rel="noopener noreferrer" className="hover:text-link">
                    {club.name}
                  </a>
                ) : (
                  club.name
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {club.campusName ?? "Campus not on record"} · {club.strongFounders} strong {club.strongFounders === 1 ? "founder" : "founders"} · {club.members} members · {club.perMember.toFixed(2)} per member
              </p>
            </li>
          ))}
          {lists.clubs.length === 0 && <li className="text-sm text-muted">No clubs on this campus meet the bar.</li>}
        </ol>
      </section>
    </div>
  );
}
