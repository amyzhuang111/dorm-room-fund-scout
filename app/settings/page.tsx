import type { Metadata } from "next";
import { SCREENING_CONFIG } from "@/lib/screening/config";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-6 pb-16 pt-10">
      <div>
        <p className="page-eyebrow">Read only</p>
        <h1 className="page-title">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          These screening values are read-only. They are the rules the desks use today.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Screening configuration</h2>
        {Object.values(SCREENING_CONFIG).map((entry) => (
          <div key={entry.key} className="rounded-md border border-border-c bg-surface p-3 text-sm">
            <p className="font-medium text-foreground">{entry.key.replace(/_/g, " ")}</p>
            <p className="text-muted">{JSON.stringify(entry.value)} · {entry.provenance.replace(/_/g, " ")}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Environment / providers</h2>
        <p className="mt-1 text-sm text-muted">
          No search or LLM provider is configured in this build. The app runs entirely on the manual/public-source ingestion path · no paid
          API keys required for the current workflow. A Claude Code subscription does not supply application API credits; if you want
          LLM-assisted assessment proposals later, that requires its own API key wired through an env var, with the manual path staying
          fully usable if it&apos;s absent.
        </p>
      </section>
    </div>
  );
}
