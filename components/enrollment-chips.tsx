import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import { shortCampusLabel } from "@/lib/domain/campuses";
import {
  ENROLLMENT_STATUSES,
  enrollmentQuery,
  selectedEnrollment,
  type EnrollmentStatus,
} from "@/lib/domain/founder-status";
import { listEnrollmentCounts } from "@/lib/domain/queries";

const LABEL: Record<EnrollmentStatus, string> = {
  current_student: "Current student",
  recent_grad: "Recent grad",
  older_alumni: "Alumni",
  unknown: "Unknown",
};

export function EnrollmentChips({
  basePath,
  current,
  showCounts = true,
}: {
  basePath: string;
  current: Record<string, string | undefined>;
  showCounts?: boolean;
}) {
  const selected = selectedEnrollment(current.enroll);
  const counts = showCounts ? listEnrollmentCounts(current.university) : null;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="ui-label">Enrollment</span>
        {current.enroll && (
          <Link href={buildHref(basePath, current, { enroll: null })} className="text-[11px] text-accent underline">
            reset
          </Link>
        )}
      </div>
      <p className="mb-1.5 text-[11px] leading-snug text-muted">Current students and recent grads (2023–2026) are the default.</p>
      <ul className="flex flex-wrap gap-1.5">
        {ENROLLMENT_STATUSES.map((status) => {
          const on = selected.includes(status);
          const next = on ? selected.filter((item) => item !== status) : [...selected, status];
          const count = counts?.totals[status];
          return (
            <li key={status}>
              <Link
                href={buildHref(basePath, current, { enroll: enrollmentQuery(next) })}
                className={`inline-block rounded-full border px-2 py-0.5 text-xs ${on ? "border-accent bg-accent text-accent-foreground" : "border-border-c text-muted hover:bg-surface-2 hover:text-foreground"}`}
                aria-pressed={on}
              >
                {LABEL[status]}
                {count != null ? <span className="tabular-nums"> {count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {counts && counts.byCampus.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted">By campus</summary>
          <ul className="mt-1 space-y-1">
            {counts.byCampus.map((campus) => (
              <li key={campus.universityId} className="text-[11px] text-muted">
                <span className="text-foreground">{shortCampusLabel(campus.universityId, campus.name)}</span>
                {" "}
                student {campus.counts.current_student} · recent {campus.counts.recent_grad} · alumni {campus.counts.older_alumni} · unknown {campus.counts.unknown}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
