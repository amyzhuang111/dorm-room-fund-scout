"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { ASK_BROWSER_MODELS, ASK_DEFAULT_MODEL_ID, formatDownload } from "@/lib/domain/ask-browser-models";
import { NOT_IN_THE_DATA } from "@/lib/domain/ask-prompt";
import type { AskHit } from "@/lib/domain/ask-types";
import { CAMPUSES, compareCampusLabels } from "@/lib/domain/campuses";
import { setAskHighlight } from "./ask-highlight";

export const ASK_EXAMPLES = [
  "top-tier clubs with the most founders",
  "recent grads building in healthcare in NYC",
  "juniors building in AI",
  "founders backed by a16z speedrun",
];

export const ASK_CAMPUS_SUGGESTIONS = [...CAMPUSES].map((campus) => campus.shortLabel).sort(compareCampusLabels);

// Survives closing the panel so a downloaded model stays loaded.
let browserWorker: Worker | null = null;
let browserEngine: WebWorkerMLCEngine | null = null;
let browserModelId: string | null = null;
let browserLoad: Promise<boolean> | null = null;

async function ensureBrowserEngine(modelId: string, onProgress: (report: { progress: number; text: string }) => void): Promise<boolean> {
  if (browserEngine && browserModelId === modelId) return true;
  if (!browserLoad) {
    browserLoad = (async () => {
      const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
      if (!browserWorker) {
        browserWorker = new Worker(new URL("./ask-ai.worker.ts", import.meta.url), { type: "module" });
      }
      if (!browserEngine) {
        browserEngine = await CreateWebWorkerMLCEngine(browserWorker, modelId, { initProgressCallback: onProgress });
      } else if (browserModelId !== modelId) {
        onProgress({ progress: 0, text: "Switching model…" });
        await browserEngine.reload(modelId);
      }
      browserModelId = modelId;
      onProgress({ progress: 1, text: "Model ready. It stays cached in this browser." });
      return true;
    })().catch((err: unknown) => {
      browserEngine = null;
      browserModelId = null;
      throw err;
    });
  }
  try {
    return await browserLoad;
  } finally {
    browserLoad = null;
  }
}

export function AskAiProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AskAiDock />
    </>
  );
}

function highlightFrom(hits: AskHit[]): {
  ids: string[];
  campuses: string[];
  startupIds: string[];
  personIds: string[];
  focusId: string | null;
  focusCampus: string | null;
} {
  const ids = new Set<string>();
  const campuses = new Set<string>();
  const startupIds: string[] = [];
  const personIds: string[] = [];
  for (const hit of hits) {
    ids.add(hit.id);
    for (const id of hit.relatedIds) ids.add(id);
    for (const id of hit.campuses) {
      ids.add(id);
      campuses.add(id);
    }
    if (hit.kind === "startup") startupIds.push(hit.id);
    if (hit.kind === "person") personIds.push(hit.id);
  }
  return {
    ids: [...ids],
    campuses: [...campuses],
    startupIds,
    personIds,
    focusId: null,
    focusCampus: null,
  };
}

function AskAiDock() {
  const router = useRouter();
  const [webgpu, setWebgpu] = useState<boolean | null>(null);
  const [modelId, setModelId] = useState(ASK_DEFAULT_MODEL_ID);
  const [loadedId, setLoadedId] = useState<string | null>(browserModelId);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [answer] = useState("");
  const [matches] = useState<AskHit[]>([]);
  const [matchCount] = useState(0);
  const [asked] = useState(false);
  const [busy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine] = useState<"gemini" | "on-device" | "search" | null>(null);
  const [note] = useState<string | null>(null);
  const webgpuRef = useRef(webgpu);
  useEffect(() => {
    webgpuRef.current = webgpu;
  }, [webgpu]);
  const model = ASK_BROWSER_MODELS.find((item) => item.id === modelId) ?? ASK_BROWSER_MODELS[0];
  const modelReady = loadedId === modelId && browserEngine != null;

  useEffect(() => {
    let cancel = false;
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) {
      webgpuRef.current = false;
      Promise.resolve().then(() => {
        if (!cancel) setWebgpu(false);
      });
    } else {
      gpu
        .requestAdapter()
        .then((adapter) => {
          const ok = adapter != null;
          webgpuRef.current = ok;
          if (!cancel) setWebgpu(ok);
        })
        .catch(() => {
          webgpuRef.current = false;
          if (!cancel) setWebgpu(false);
        });
    }
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      setAskHighlight(null);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        return;
      }
      if (!typing && event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    function openFromNav() {
      setOpen(true);
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("campus-scout-open-ask", openFromNav);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("campus-scout-open-ask", openFromNav);
    };
  }, []);

  function close() {
    setAskHighlight(null);
    setOpen(false);
    inputRef.current?.blur();
  }

  function focusHit(hit: AskHit) {
    const next = highlightFrom(matches);
    next.focusId = hit.id;
    next.focusCampus = hit.campuses[0] ?? null;
    setAskHighlight(next);
  }

  async function loadModel(): Promise<boolean> {
    if (webgpuRef.current === false) return false;
    if (browserEngine && browserModelId === modelId) {
      setLoadedId(modelId);
      return true;
    }
    setError(null);
    setLoading(true);
    setProgress(0);
    setProgressText("Starting download…");
    try {
      const ready = await ensureBrowserEngine(modelId, (report) => {
        setProgress(report.progress);
        setProgressText(report.text);
      });
      if (ready) setLoadedId(modelId);
      return ready;
    } catch (err) {
      setLoadedId(null);
      const message = err instanceof Error ? err.message : "";
      setError(message || "The model could not load. Search results still work.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function go(text: string) {
    const q = text.trim();
    if (!q) return;
    try {
      const recent = JSON.parse(localStorage.getItem("campus-scout-ask-recent") || "[]") as string[];
      const next = [q, ...recent.filter((item) => item !== q)].slice(0, 5);
      localStorage.setItem("campus-scout-ask-recent", JSON.stringify(next));
    } catch {
      // Storage can be blocked. The question still opens.
    }
    setOpen(false);
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  if (!open) return null;

  const recent = (() => {
    try {
      return JSON.parse(localStorage.getItem("campus-scout-ask-recent") || "[]") as string[];
    } catch {
      return [];
    }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-[#12110f]/40" onMouseDown={() => setOpen(false)}>
      <section
        data-ask-ai-panel
        data-ask-open="yes"
        className="absolute left-1/2 top-[120px] w-[min(640px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-line bg-raised text-fg"
        aria-label="Ask"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form
          className="flex items-center gap-2 px-4 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            go(question);
          }}
        >
          <label htmlFor="ask-ai-q" className="sr-only">
            Ask Campus Scout
          </label>
          <input
            ref={inputRef}
            id="ask-ai-q"
            data-ask-ai-button
            value={question}
            disabled={busy}
            onChange={(event) => setQuestion(event.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Ask Campus Scout"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          {open ? (
            <button type="button" className="text-xs font-semibold underline" onClick={close}>
              Close
            </button>
          ) : (
            <kbd className="rounded border border-border-c px-1.5 py-0.5 text-[10px] font-semibold">/</kbd>
          )}
            <button type="submit" disabled={busy || !question.trim()} aria-label="Ask" className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-sm text-background disabled:opacity-40">
            ↑
          </button>
        </form>
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden" inert={open ? undefined : true} aria-hidden={open ? undefined : true}>
            <div className="max-h-[min(32rem,calc(100dvh-8rem))] space-y-3 overflow-y-auto border-t border-border-c px-3 py-3">
              <p className="text-xs text-foreground">Answers use Campus Scout records. Gemini’s free tier answers first. If Gemini is unavailable, a small model runs in this browser.</p>
              {!asked && (
                <div>
                  {recent.length > 0 && (
                    <>
                      <p className="micro">Recent</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {recent.map((item) => (
                          <button key={item} type="button" className="rounded border border-line px-3 py-1 text-left text-xs" onClick={() => go(item)}>
                            {item}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="micro mt-3">Try</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ASK_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        className="rounded-full border border-border-c px-3 py-1 text-left text-xs font-medium hover:bg-foreground hover:text-background"
                        onClick={() => go(example)}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide">Campuses</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ASK_CAMPUS_SUGGESTIONS.map((campus) => (
                      <button
                        key={campus}
                        type="button"
                        className="rounded-full border border-border-c px-2 py-0.5 text-[11px] font-medium hover:bg-foreground hover:text-background"
                        onClick={() => go(`${campus} founders`)}
                      >
                        {campus}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {webgpu === false && (
                <div className="border border-border-c px-3 py-2" data-ask-webgpu="no">
                  <p className="text-sm font-semibold">This browser can’t run the on-device model</p>
                  <p className="mt-1 text-xs leading-snug">WebGPU isn’t available on this browser or device. Ask still searches Campus Scout and lists the matching records.</p>
                </div>
              )}
              {webgpu !== false && (
                <details className="border border-border-c px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold">On-device fallback · {formatDownload(model.bytes)}</summary>
                  <div className="mt-2 space-y-2">
                    <label className="block text-[10px] font-semibold uppercase tracking-wide" htmlFor="ask-ai-model">
                      Model
                    </label>
                    <select
                      id="ask-ai-model"
                      data-ask-model
                      value={modelId}
                      onChange={(event) => setModelId(event.target.value)}
                      className="w-full border border-border-c bg-surface px-2 py-1.5 text-xs text-foreground"
                    >
                      {ASK_BROWSER_MODELS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                          {item.id === ASK_DEFAULT_MODEL_ID ? " (default)" : ""} — {formatDownload(item.bytes)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      data-ask-ai-load
                      disabled={loading || modelReady}
                      onClick={() => void loadModel()}
                      className="bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:bg-neutral-400"
                    >
                      {loading ? "Loading…" : modelReady ? "Model ready" : `Load model (${formatDownload(model.bytes)})`}
                    </button>
                    {(loading || progressText) && (
                      <div>
                        <div className="h-2 border border-border-c" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                          <div className="h-full bg-foreground" style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] leading-snug">{progressText}</p>
                      </div>
                    )}
                  </div>
                </details>
              )}
              {error && <p className="text-sm font-medium">{error}</p>}
              {note && (
                <p className="text-xs leading-snug" data-ask-note>
                  {note}
                </p>
              )}
              {busy && !answer && <p className="text-sm">Searching Campus Scout…</p>}
              {engine && (
                <p className="text-[10px] font-semibold uppercase tracking-wide" data-ask-engine={engine}>
                  {engine === "gemini" ? "Gemini" : engine === "on-device" ? "On-device" : "Search-only"}
                </p>
              )}
              {answer && (
                <p className="text-sm leading-snug" data-ask-ai-answer>
                  {answer}
                  {busy && <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-foreground" />}
                </p>
              )}
              {asked && !busy && matches.length === 0 && !error && !answer && <p className="text-sm font-medium">{NOT_IN_THE_DATA}</p>}
              {matches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide">{matchCount} records</p>
                    <button type="button" className="text-[11px] font-semibold underline" onClick={() => setAskHighlight(null)}>
                      Show full map
                    </button>
                  </div>
                  <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {matches.slice(0, 12).map((hit) => (
                      <li key={`${hit.kind}:${hit.id}`} className="w-44 shrink-0">
                        <button
                          type="button"
                          data-ask-hit={hit.id}
                          className="h-full w-full rounded-2xl border border-border-c bg-surface p-2 text-left shadow-sm hover:bg-foreground hover:text-background"
                          onClick={() => focusHit(hit)}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wide">{hit.kind}</span>
                          <span className="mt-0.5 block text-sm font-semibold leading-tight">{hit.name}</span>
                          {hit.detail && <span className="mt-1 line-clamp-3 block text-[11px] leading-snug">{hit.detail}</span>}
                        </button>
                        <div className="mt-1 flex flex-wrap gap-2 px-1 text-[11px]">
                          <Link href={hit.href} className="font-semibold underline">
                            Record
                          </Link>
                          {hit.sources
                            .filter((source) => source.url.startsWith("http"))
                            .slice(0, 1)
                            .map((source) => (
                              <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="font-semibold underline">
                                {source.label}
                              </a>
                            ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
