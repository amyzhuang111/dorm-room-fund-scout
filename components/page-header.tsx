import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  stats = [],
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  stats?: { n: number | null; label: string }[];
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header>
      <p className="page-eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      {children}
      {stats.length > 0 && (
        <div className="stat-strip">
          {stats.map((stat) => (
            <p key={stat.label}>
              <span className="stat-num">{stat.n == null ? "-" : stat.n.toLocaleString("en-US")}</span>
              <span className="stat-kicker">{stat.label}</span>
            </p>
          ))}
        </div>
      )}
      {aside ? <div className="mt-6 flex justify-end">{aside}</div> : null}
    </header>
  );
}
