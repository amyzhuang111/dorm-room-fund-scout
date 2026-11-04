import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Screening" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-[720px] space-y-4 px-6 pb-16 pt-10">
      <h1 className="page-title">Screening</h1>
      <p className="text-sm leading-6 text-muted">
        The public list is for students and people who graduated within the last two years. An MVP is not required.
      </p>
      <p className="text-sm leading-6 text-muted">
        Internal research weights stay off this page. They are not a published eligibility rule.
      </p>
      <p>
        <Link href="/methodology" className="inline-flex min-h-11 items-center text-sm underline">
          How the list is built
        </Link>
      </p>
    </div>
  );
}
