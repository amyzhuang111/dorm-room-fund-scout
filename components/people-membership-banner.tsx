import Link from "next/link";
import { describePeopleMembership } from "@/lib/domain/counted-membership";

export function PeopleMembershipBanner({
  membership,
  program,
  sector,
  listed,
}: {
  membership?: string;
  program?: string;
  sector?: string;
  listed: number;
}) {
  const view = describePeopleMembership({ membership, program, sector }, listed);
  if (!view) return null;
  return (
    <div className="mb-3 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-white p-3 text-sm leading-6" data-people-membership="">
      <p className="font-semibold" data-people-membership-count="">{view.heading}</p>
      <p>{view.detail}</p>
      {view.nameSearchHref && view.nameSearchLabel ? (
        <p>
          <Link href={view.nameSearchHref} className="text-[color:var(--cobalt,#2F4FD8)] underline">{view.nameSearchLabel}</Link>
          {" "}This name search is a different list.
        </p>
      ) : null}
    </div>
  );
}
