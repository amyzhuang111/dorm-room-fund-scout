"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  deleteStartup as dropStartup,
  EMPTY_PIPELINE,
  findDuplicates,
  mergeCatalog,
  mergePipelineStates,
  parseState,
  recordsFromState,
  removeLink as dropLink,
  setLinkSource as sourceLink,
  setLinkStage as moveLink,
  setStartupSource as sourceStartup,
  setStartupStage as moveStartup,
  starEntity,
  unstarEntity,
  upsertStartup,
  validateDraft,
  type DuplicateHit,
  type PipelineStage,
  type SourceChannel,
  type StartupDraft,
  type UserPipelineState,
  type ValidStartup,
} from "@/lib/domain/user-pipeline";
import type { CandidateSummary, FounderRow, UniversitySummary } from "@/lib/domain/queries";

const STORAGE_KEY = "campus-scout-user-pipeline-v1";
const CHANGE = "scout-user-pipeline-change";

export type PipelineStorage = "unknown" | "local" | "remote";

interface SaveOk {
  ok: true;
}
interface SaveFail {
  ok: false;
  errors?: Record<string, string>;
  duplicates?: DuplicateHit[];
  value?: ValidStartup;
}

interface PipelineApi {
  storage: PipelineStorage;
  backend: "postgres" | "upstash" | null;
  notice: string | null;
  state: UserPipelineState;
  saveStartup: (draft: StartupDraft, opts?: { id?: string; force?: boolean }) => Promise<SaveOk | SaveFail>;
  linkInstead: (hit: DuplicateHit, value: ValidStartup) => void;
  deleteStartup: (id: string) => void;
  setStartupStage: (id: string, stage: PipelineStage) => void;
  setStartupSource: (id: string, sourcedVia: SourceChannel | null, referrer: string | null) => void;
  star: (input: {
    entityType: "project" | "person";
    entityId: string;
    name: string;
    campusName: string | null;
    websiteUrl: string | null;
    verificationUrl?: string | null;
    verificationNotes?: string | null;
    stage?: PipelineStage;
    sourcedVia?: SourceChannel | null;
    referrer?: string | null;
  }) => void;
  unstar: (entityType: "project" | "person", entityId: string) => void;
  setLinkStage: (id: string, stage: PipelineStage) => void;
  setLinkSource: (id: string, sourcedVia: SourceChannel | null, referrer: string | null) => void;
  removeLink: (id: string) => void;
}

const Ctx = createContext<PipelineApi | null>(null);

function emit() {
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CHANGE, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(CHANGE, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

let cachedRaw = "";
let cachedState: UserPipelineState = EMPTY_PIPELINE;

function readState(): UserPipelineState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? "";
    if (raw === cachedRaw) return cachedState;
    cachedRaw = raw;
    cachedState = raw ? parseState(JSON.parse(raw)) : EMPTY_PIPELINE;
    return cachedState;
  } catch {
    return EMPTY_PIPELINE;
  }
}

function writeLocal(state: UserPipelineState) {
  const raw = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedState = state;
  emit();
}

function dedupeHits(hits: DuplicateHit[]): DuplicateHit[] {
  const seen = new Set<string>();
  const out: DuplicateHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push(hit);
  }
  return out.slice(0, 8);
}

export function UserPipelineProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, readState, () => EMPTY_PIPELINE);
  const remoteOn = useRef(false);
  const timer = useRef<number | null>(null);
  const [storage, setStorage] = useState<PipelineStorage>("unknown");
  const [backend, setBackend] = useState<"postgres" | "upstash" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pushRemote = useCallback((next: UserPipelineState) => {
    if (!remoteOn.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fetch("/api/user-pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      })
        .then((res) => {
          if (!res.ok) throw new Error("save failed");
        })
        .catch(() => {
          remoteOn.current = false;
          setStorage("local");
          setNotice("The hosted database could not be saved. Entries are saved only in this browser.");
        });
    }, 250);
  }, []);

  const commit = useCallback(
    (next: UserPipelineState) => {
      writeLocal(next);
      pushRemote(next);
    },
    [pushRemote]
  );

  useEffect(() => {
    let cancel = false;
    fetch("/api/user-pipeline")
      .then(async (res) => {
        const data = (await res.json()) as {
          configured?: boolean;
          backend?: "postgres" | "upstash" | null;
          state?: UserPipelineState | null;
          error?: string;
        };
        if (cancel) return;
        setBackend(data.backend ?? null);
        if (!data.configured || !res.ok) {
          remoteOn.current = false;
          setStorage("local");
          if (data.configured && !res.ok) {
            setNotice("The hosted database could not be reached. Entries are saved only in this browser.");
          }
          return;
        }
        remoteOn.current = true;
        setStorage("remote");
        setNotice(null);
        const remote = parseState(data.state);
        const merged = mergePipelineStates(remote, readState());
        writeLocal(merged);
        if (JSON.stringify(merged) !== JSON.stringify(remote)) {
          fetch("/api/user-pipeline", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(merged),
          }).catch(() => {
            remoteOn.current = false;
            setStorage("local");
            setNotice("The hosted database could not be saved. Entries are saved only in this browser.");
          });
        }
      })
      .catch(() => {
        if (!cancel) {
          remoteOn.current = false;
          setStorage("local");
        }
      });
    return () => {
      cancel = true;
    };
  }, []);

  const api = useMemo<PipelineApi>(
    () => ({
      storage,
      backend,
      notice,
      state,
      saveStartup: async (draft, opts) => {
        const validated = validateDraft(draft);
        if (!validated.ok) return { ok: false, errors: validated.errors };
        const current = readState();
        const previous = opts?.id ? current.startups.find((startup) => startup.id === opts.id) : undefined;
        const ignore = [opts?.id, ...(previous?.founders.map((founder) => founder.id) ?? [])].filter((id): id is string => !!id);
        if (!opts?.force) {
          const localHits = findDuplicates(
            {
              name: validated.value.name,
              websiteUrl: validated.value.websiteUrl,
              founderNames: validated.value.founders.map((founder) => founder.name),
            },
            recordsFromState(current),
            ignore
          );
          let remoteHits: DuplicateHit[] = [];
          try {
            const res = await fetch("/api/user-pipeline/duplicates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: validated.value.name,
                websiteUrl: validated.value.websiteUrl,
                founderNames: validated.value.founders.map((founder) => founder.name),
                ignoreIds: ignore,
              }),
            });
            if (res.ok) {
              const data = (await res.json()) as { matches?: DuplicateHit[] };
              remoteHits = data.matches ?? [];
            }
          } catch {
            remoteHits = [];
          }
          const duplicates = dedupeHits([...remoteHits, ...localHits]);
          if (duplicates.length > 0) return { ok: false, duplicates, value: validated.value };
        }
        commit(upsertStartup(readState(), validated.value, validated.value.campusName, opts?.id));
        return { ok: true };
      },
      linkInstead: (hit, value) => {
        if (hit.id.startsWith("user_") || hit.id.startsWith("ufounder_")) return;
        commit(
          starEntity(readState(), {
            entityType: hit.kind === "startup" ? "project" : "person",
            entityId: hit.id,
            name: hit.name,
            campusName: hit.campusName,
            websiteUrl: hit.kind === "startup" ? hit.websiteUrl : value.websiteUrl,
            verificationUrl: value.verificationUrl,
            verificationNotes: value.verificationNotes,
            stage: value.stage,
            sourcedVia: value.sourcedVia,
            referrer: value.referrer,
          })
        );
      },
      deleteStartup: (id) => commit(dropStartup(readState(), id)),
      setStartupStage: (id, stage) => commit(moveStartup(readState(), id, stage)),
      setStartupSource: (id, sourcedVia, referrer) => commit(sourceStartup(readState(), id, sourcedVia, referrer)),
      star: (input) => commit(starEntity(readState(), input)),
      unstar: (entityType, entityId) => commit(unstarEntity(readState(), entityType, entityId)),
      setLinkStage: (id, stage) => commit(moveLink(readState(), id, stage)),
      setLinkSource: (id, sourcedVia, referrer) => commit(sourceLink(readState(), id, sourcedVia, referrer)),
      removeLink: (id) => commit(dropLink(readState(), id)),
    }),
    [storage, backend, notice, state, commit]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useUserPipeline(): PipelineApi {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    storage: "unknown",
    backend: null,
    notice: null,
    state: EMPTY_PIPELINE,
    saveStartup: async () => ({ ok: false, errors: { form: "Pipeline is unavailable." } }),
    linkInstead: () => {},
    deleteStartup: () => {},
    setStartupStage: () => {},
    setStartupSource: () => {},
    star: () => {},
    unstar: () => {},
    setLinkStage: () => {},
    setLinkSource: () => {},
    removeLink: () => {},
  };
}

export function useMergedCatalog(universities: UniversitySummary[], candidates: CandidateSummary[], founders: FounderRow[]) {
  const { state } = useUserPipeline();
  return useMemo(() => mergeCatalog({ universities, candidates, founders }, state), [universities, candidates, founders, state]);
}

export function UserPipelineBanner() {
  const { storage, notice } = useUserPipeline();
  if (storage !== "local") return null;
  return (
    <div className="border-b border-border-c bg-surface px-4 py-2 text-center text-sm text-foreground">
      {notice ?? "Pipeline entries are saved only in this browser. They stay on this device until a free database is connected."}{" "}
      <Link href="/startup/pipeline#setup" className="font-semibold underline">
        One-time setup
      </Link>
    </div>
  );
}
