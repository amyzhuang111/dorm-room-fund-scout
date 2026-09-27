"use client";

import { useMemo, useState } from "react";
import { isUserCampusId, PIPELINE_STAGES, type DuplicateHit, type StartupDraft, type UserStartup, type ValidStartup } from "@/lib/domain/user-pipeline";
import { PipelineSourceFields } from "./pipeline-source-fields";
import { useUserPipeline } from "./user-pipeline-provider";

const inputClass = "w-full rounded-md border border-black bg-white px-2.5 py-1.5 text-sm text-black placeholder:text-neutral-500";

function blankFounder() {
  return { id: undefined as string | undefined, name: "", linkedinUrl: "", classYear: "", role: "" };
}

function fromStartup(startup: UserStartup): StartupDraft {
  return {
    name: startup.name,
    websiteUrl: startup.websiteUrl ?? "",
    campusId: isUserCampusId(startup.campusId) ? null : startup.campusId,
    campusName: startup.campusName,
    campusIsNew: isUserCampusId(startup.campusId),
    founders: startup.founders.length
      ? startup.founders.map((founder) => ({
          id: founder.id,
          name: founder.name,
          linkedinUrl: founder.linkedinUrl ?? "",
          classYear: founder.classYear ?? "",
          role: founder.role ?? "",
        }))
      : [blankFounder()],
    fundingStage: startup.fundingStage ?? "",
    description: startup.description,
    verificationUrl: startup.verificationUrl,
    verificationNotes: startup.verificationNotes,
    stage: startup.stage,
    sourcedVia: startup.sourcedVia,
    referrer: startup.referrer,
  };
}

export function AddStartupForm({
  campuses,
  initial,
  onCancel,
  onSaved,
}: {
  campuses: { id: string; name: string }[];
  initial?: UserStartup | null;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const pipeline = useUserPipeline();
  const [draft, setDraft] = useState<StartupDraft>(() => (initial ? fromStartup(initial) : {
    name: "",
    websiteUrl: "",
    campusId: null,
    campusName: "",
    campusIsNew: false,
    founders: [blankFounder()],
    fundingStage: "",
    description: "",
    verificationUrl: "",
    verificationNotes: "",
    stage: "Sourced",
    sourcedVia: null,
    referrer: null,
  }));
  const [campusQuery, setCampusQuery] = useState(initial?.campusName ?? "");
  const [campusOpen, setCampusOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([]);
  const [pending, setPending] = useState<ValidStartup | null>(null);
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const campus of campuses) map.set(campus.id, campus);
    for (const campus of pipeline.state.campuses) map.set(campus.id, { id: campus.id, name: campus.name });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [campuses, pipeline.state.campuses]);

  const query = campusQuery.trim().toLowerCase();
  const shown = (query ? options.filter((campus) => campus.name.toLowerCase().includes(query)) : options).slice(0, 12);
  const exact = options.some((campus) => campus.name.toLowerCase() === query);

  function chooseCampus(campus: { id: string; name: string }) {
    setDraft((current) => ({ ...current, campusId: campus.id, campusName: campus.name, campusIsNew: false }));
    setCampusQuery(campus.name);
    setCampusOpen(false);
  }

  function chooseOther() {
    const name = campusQuery.trim();
    setDraft((current) => ({ ...current, campusId: null, campusName: name, campusIsNew: true }));
    setCampusOpen(false);
  }

  function setFounder(index: number, patch: Partial<StartupDraft["founders"][number]>) {
    setDraft((current) => ({
      ...current,
      founders: current.founders.map((founder, item) => (item === index ? { ...founder, ...patch } : founder)),
    }));
  }

  function resolvedDraft(): StartupDraft {
    const typed = campusQuery.trim();
    const match = options.find((campus) => campus.name.toLowerCase() === typed.toLowerCase());
    if (match) return { ...draft, campusId: match.id, campusName: match.name, campusIsNew: false };
    if (typed.length >= 2 && !draft.campusId) return { ...draft, campusId: null, campusName: typed, campusIsNew: true };
    return draft;
  }

  async function submit(force: boolean) {
    const next = resolvedDraft();
    setDraft(next);
    setSaving(true);
    const result = await pipeline.saveStartup(next, { id: initial?.id, force });
    setSaving(false);
    if (result.ok) {
      setDuplicates([]);
      setPending(null);
      onSaved();
      return;
    }
    setErrors(result.errors ?? {});
    setDuplicates(result.duplicates ?? []);
    setPending(result.value ?? null);
  }

  return (
    <form
      className="rounded-lg border border-black bg-white p-4 text-black"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{initial ? "Edit startup" : "Add startup / founder"}</h2>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs font-medium underline">
            Close
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-700">Entries show up in the pipeline, search, campus lists, and the map. A verification source is required.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold uppercase tracking-wide">
          Startup name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required className={`${inputClass} mt-1`} />
          {errors.name && <span className="mt-1 block font-medium normal-case tracking-normal text-red-900">{errors.name}</span>}
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide">
          Website
          <input value={draft.websiteUrl} onChange={(event) => setDraft({ ...draft, websiteUrl: event.target.value })} placeholder="https://" className={`${inputClass} mt-1`} />
          {errors.websiteUrl && <span className="mt-1 block font-medium normal-case tracking-normal text-red-900">{errors.websiteUrl}</span>}
        </label>
        <div className="relative block text-xs font-semibold uppercase tracking-wide">
          Campus
          <input
            value={campusQuery}
            onChange={(event) => {
              setCampusQuery(event.target.value);
              setCampusOpen(true);
              setDraft((current) => ({ ...current, campusId: null, campusName: event.target.value, campusIsNew: false }));
            }}
            onFocus={() => setCampusOpen(true)}
            onBlur={() => window.setTimeout(() => setCampusOpen(false), 150)}
            placeholder="Search universities"
            aria-autocomplete="list"
            className={`${inputClass} mt-1`}
          />
          {campusOpen && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-black bg-white shadow-lg" role="listbox">
              {shown.map((campus) => (
                <li key={campus.id}>
                  <button type="button" className="block w-full px-2.5 py-1.5 text-left text-sm font-medium normal-case hover:bg-neutral-100" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseCampus(campus)}>
                    {campus.name}
                  </button>
                </li>
              ))}
              {query.length >= 2 && !exact && (
                <li>
                  <button type="button" className="block w-full px-2.5 py-1.5 text-left text-sm font-medium normal-case hover:bg-neutral-100" onMouseDown={(event) => event.preventDefault()} onClick={chooseOther}>
                    Other university: {campusQuery.trim()}
                  </button>
                </li>
              )}
              {shown.length === 0 && query.length < 2 && <li className="px-2.5 py-1.5 text-sm font-medium normal-case text-neutral-600">Type to search</li>}
            </ul>
          )}
          {draft.campusIsNew && <p className="mt-1 font-medium normal-case tracking-normal">New campus: {draft.campusName}. It will be listed alphabetically. It is not placed on the globe, because this app does not invent coordinates.</p>}
          {errors.campus && <span className="mt-1 block font-medium normal-case tracking-normal text-red-900">{errors.campus}</span>}
        </div>
        <label className="block text-xs font-semibold uppercase tracking-wide">
          Stage / funding if known
          <input value={draft.fundingStage} onChange={(event) => setDraft({ ...draft, fundingStage: event.target.value })} placeholder="Pre-seed, bootstrapped…" className={`${inputClass} mt-1`} />
          {errors.fundingStage && <span className="mt-1 block font-medium normal-case tracking-normal text-red-900">{errors.fundingStage}</span>}
        </label>
      </div>

      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide">
        One-line description
        <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${inputClass} mt-1`} />
        {errors.description && <span className="mt-1 block font-medium normal-case tracking-normal text-red-900">{errors.description}</span>}
      </label>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide">Founders</p>
          <button type="button" className="text-xs font-medium underline" onClick={() => setDraft({ ...draft, founders: [...draft.founders, blankFounder()] })}>
            Add founder
          </button>
        </div>
        <ul className="mt-2 space-y-2">
          {draft.founders.map((founder, index) => (
            <li key={founder.id ?? index} className="grid gap-2 rounded-md border border-black/20 p-2 sm:grid-cols-4">
              <input value={founder.name} onChange={(event) => setFounder(index, { name: event.target.value })} placeholder="Name" aria-label={`Founder ${index + 1} name`} className={inputClass} />
              <input value={founder.linkedinUrl} onChange={(event) => setFounder(index, { linkedinUrl: event.target.value })} placeholder="LinkedIn URL" aria-label={`Founder ${index + 1} LinkedIn`} className={inputClass} />
              <input value={founder.classYear} onChange={(event) => setFounder(index, { classYear: event.target.value })} placeholder="Class year" aria-label={`Founder ${index + 1} class year`} className={inputClass} />
              <input value={founder.role} onChange={(event) => setFounder(index, { role: event.target.value })} placeholder="Role" aria-label={`Founder ${index + 1} role`} className={inputClass} />
              {(errors[`founder-${index}-name`] || errors[`founder-${index}-linkedin`] || errors[`founder-${index}-year`]) && (
                <p className="sm:col-span-4 text-xs font-medium text-red-900">
                  {errors[`founder-${index}-name`] || errors[`founder-${index}-linkedin`] || errors[`founder-${index}-year`]}
                </p>
              )}
              {draft.founders.length > 1 && (
                <button type="button" className="text-left text-xs underline sm:col-span-4" onClick={() => setDraft({ ...draft, founders: draft.founders.filter((_, item) => item !== index) })}>
                  Remove founder
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold uppercase tracking-wide">
          Verification source URL
          <input value={draft.verificationUrl} onChange={(event) => setDraft({ ...draft, verificationUrl: event.target.value })} required placeholder="https://" className={`${inputClass} mt-1`} />
          {errors.verificationUrl && <span className="mt-1 block font-medium normal-case tracking-normal text-red-900">{errors.verificationUrl}</span>}
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide">
          Pipeline stage
          <select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value as StartupDraft["stage"] })} className={`${inputClass} mt-1`}>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PipelineSourceFields
        sourcedVia={draft.sourcedVia}
        referrer={draft.referrer}
        onChange={(next) => setDraft({ ...draft, sourcedVia: next.sourcedVia, referrer: next.referrer })}
      />
      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide">
        Notes
        <textarea value={draft.verificationNotes} onChange={(event) => setDraft({ ...draft, verificationNotes: event.target.value })} rows={3} className={`${inputClass} mt-1`} />
        {errors.verificationNotes && <span className="mt-1 block font-medium normal-case tracking-normal text-red-900">{errors.verificationNotes}</span>}
      </label>

      {duplicates.length > 0 && pending && (
        <div className="mt-3 rounded-md border border-black bg-neutral-50 p-3">
          <p className="text-sm font-semibold">Possible duplicates</p>
          <p className="mt-1 text-xs text-neutral-700">Link an existing record instead of creating another one.</p>
          <ul className="mt-2 space-y-2">
            {duplicates.map((hit) => (
              <li key={hit.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <a href={hit.href} className="font-medium underline">
                    {hit.name}
                  </a>
                  <span className="text-neutral-700"> · {hit.kind}{hit.campusName ? ` · ${hit.campusName}` : ""} · {hit.reason}</span>
                </span>
                <button
                  type="button"
                  className="rounded-md border border-black bg-black px-2.5 py-1 text-xs font-medium text-white"
                  onClick={() => {
                    pipeline.linkInstead(hit, pending);
                    setDuplicates([]);
                    onSaved();
                  }}
                >
                  Link instead
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-xs font-medium underline" disabled={saving} onClick={() => void submit(true)}>
            Add as a new entry anyway
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-md border border-black bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {saving ? "Saving…" : initial ? "Save changes" : "Add to pipeline"}
        </button>
      </div>
    </form>
  );
}
