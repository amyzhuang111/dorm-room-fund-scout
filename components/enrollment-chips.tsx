import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import {
  enrollmentQuery,
  selectedEnrollment,
  type EnrollmentStatus,
} from "@/lib/domain/founder-status";
import { listFounderStatusCounts } from "@/lib/domain/queries";

const LABEL: Record<EnrollmentStatus, string> = {
  current_student: "Student",
  recent_grad: "New grad",
  older_alumni: "Alumni",
  unknown: "Unknown",
};

const PRIMARY: EnrollmentStatus[] = ["current_student", "recent_grad", "older_alumni"];

export function EnrollmentChips({
  basePath,
  current,
}: {
  basePath: string;
  current: Record<string, string | undefined>;
}) {
  const selected = selectedEnrollment(current.enroll);
  const counts = listFounderStatusCounts(current.university);

  function hrefFor(status: EnrollmentStatus) {
    const on = selected.includes(status);
    const next = on ? selected.filter((item) => item !== status) : [...selected, status];
    return buildHref(basePath, current, { enroll: enrollmentQuery(next) });
  }

  const primaryClass = (on: boolean) =>
    `inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
      on ? "border-accent bg-accent text-accent-foreground" : "border-border-c bg-surface text-foreground hover:bg-surface-2"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Founder status">
        {PRIMARY.map((status) => {
          const on = selected.includes(status);
          return (
            <Link key={status} href={hrefFor(status)} className={primaryClass(on)} aria-pressed={on}>
              {LABEL[status]}
              <span className="tabular-nums">{counts[status]}</span>
            </Link>
          );
        })}
        <Link
          href={hrefFor("unknown")}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
            selected.includes("unknown")
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border-c text-muted hover:bg-surface-2 hover:text-foreground"
          }`}
          aria-pressed={selected.includes("unknown")}
        >
          Unknown
          <span className="tabular-nums">{counts.unknown}</span>
        </Link>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted">Student and New grad are on. New grad means graduated in 2023–2026.</p>
    </div>
  );
}
