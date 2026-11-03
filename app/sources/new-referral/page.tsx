import { listUniversities } from "@/lib/domain/queries";
import { addManualReferral } from "@/lib/actions/manual-referral";

export default function NewReferralPage() {
  const universities = listUniversities();
  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Add a manual referral</h1>
      <p className="mt-1 text-sm text-muted">
        For a firsthand lead you know about directly · who kept building after the hackathon, who built something you actually use. This
        goes through the exact same screening gates as anything ingested; nothing about entering it manually skips eligibility checks. Your
        note is stored as a labeled <code className="font-mono text-xs">user_note</code> claim, never presented as an independently observed
        fact.
      </p>

      <form action={addManualReferral} className="mt-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted">Company / project name *</label>
          <input name="companyName" required className="mt-1 w-full rounded-md border border-border-c bg-surface px-2.5 py-1.5 text-sm" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">What are they building? (optional)</label>
          <textarea name="description" rows={2} className="mt-1 w-full rounded-md border border-border-c bg-surface px-2.5 py-1.5 text-sm" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">Website (optional)</label>
          <input name="websiteUrl" type="url" placeholder="https://…" className="mt-1 w-full rounded-md border border-border-c bg-surface px-2.5 py-1.5 text-sm" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">University *</label>
          <select name="universityId" required className="mt-1 w-full rounded-md border border-border-c bg-surface px-2.5 py-1.5 text-sm">
            <option value="">Select…</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">Founder name(s) *</label>
          <input name="founderNames" required placeholder="Comma-separated if more than one" className="mt-1 w-full rounded-md border border-border-c bg-surface px-2.5 py-1.5 text-sm" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">Founder status (your best read) *</label>
          <select name="founderStatus" defaultValue="unverified" className="mt-1 w-full rounded-md border border-border-c bg-surface px-2.5 py-1.5 text-sm">
            <option value="current_student">Current student</option>
            <option value="recent_grad">Recent grad</option>
            <option value="older_alumni">Older alumni</option>
            <option value="unverified">Not sure · flag for verification</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">Your firsthand note *</label>
          <textarea
            name="noteBody"
            required
            rows={3}
            placeholder="How you know about this, and what specifically you saw · not a vague endorsement."
            className="mt-1 w-full rounded-md border border-border-c bg-surface px-2.5 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">Your name (for attribution)</label>
          <input name="referrer" placeholder="Name for attribution" className="mt-1 w-full rounded-md border border-border-c bg-surface px-2.5 py-1.5 text-sm" />
        </div>

        <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
          Add and screen
        </button>
      </form>
    </div>
  );
}
