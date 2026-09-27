"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { ASK_BROWSER_MODELS, ASK_DEFAULT_MODEL_ID, formatDownload } from "@/lib/domain/ask-browser-models";
import { ASK_SYSTEM_PROMPT, askUserPrompt, fallbackAnswer, NOT_IN_THE_DATA, onDeviceNote } from "@/lib/domain/ask-prompt";
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

async function waitForWebgpu(read: () => boolean | null): Promise<boolean> {
  if (read() === false) return false;
  if (read() === true) return true;
  const started = Date.now();
  while (read() === null && Date.now() - started < 2500) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return read() === true;
}

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
  const pathname = usePathname();
  const onAskSurface = pathname === "/" || pathname === "/founder/network";
  return (
    <>
      {children}
      {onAskSurface && <AskAiDock />}
    </>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path fill="currentColor" d="M8 .6 9.3 5.4 14.2 6.6 9.3 7.9 8 12.8 6.7 7.9 1.8 6.6 6.7 5.4 8 .6Z" />
      <path fill="currentColor" d="M12.6 1.2 13.1 2.8 14.7 3.3 13.1 3.8 12.6 5.4 12.1 3.8 10.5 3.3 12.1 2.8 12.6 1.2Z" />
    </svg>
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
  const [webgpu, setWebgpu] = useState<boolean | null>(null);
  const [modelId, setModelId] = useState(ASK_DEFAULT_MODEL_ID);
  const [loadedId, setLoadedId] = useState<string | null>(browserModelId);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [answer, setAnswer] = useState("");
  const [matches, setMatches] = useState<AskHit[]>([]);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<"gemini" | "on-device" | "search" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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
      abortRef.current?.abort();
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function close() {
    abortRef.current?.abort();
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

  async function revealAnswer(text: string, signal: AbortSignal) {
    const size = Math.max(2, Math.ceil(text.length / 28));
    for (let i = size; i < text.length; i += size) {
      if (signal.aborted) return;
      setAnswer(text.slice(0, i));
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    if (!signal.aborted) setAnswer(text);
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

  function deviceCanRunModel(): Promise<boolean> {
    return waitForWebgpu(() => webgpuRef.current);
  }

  async function answerOnDevice(trimmed: string, rows: AskHit[], quota: boolean) {
    const canRun = await deviceCanRunModel();
    const signal = abortRef.current?.signal ?? new AbortController().signal;
    if (!canRun) {
      setNote(onDeviceNote(quota, false));
      setEngine("search");
      await revealAnswer(fallbackAnswer(rows), signal);
      return;
    }
    setNote(onDeviceNote(quota, true));
    const ready = await loadModel();
    if (!ready || !browserEngine) {
      setEngine("search");
      await revealAnswer(fallbackAnswer(rows), signal);
      return;
    }
    setEngine("on-device");
    await browserEngine.resetChat();
    const stream = await browserEngine.chat.completions.create({
      stream: true,
      temperature: 0.2,
      max_tokens: 280,
      messages: [
        { role: "system", content: ASK_SYSTEM_PROMPT },
        { role: "user", content: askUserPrompt(trimmed, rows) },
      ],
    });
    let textOut = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (!delta) continue;
      textOut += delta;
      setAnswer(textOut);
    }
    if (!textOut.trim()) await revealAnswer(fallbackAnswer(rows), abortRef.current?.signal ?? new AbortController().signal);
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setOpen(true);
    setQuestion(trimmed);
    setAnswer("");
    setMatches([]);
    setAsked(true);
    setError(null);
    setEngine(null);
    setNote(null);
    setAskHighlight(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });
      const data = (await res.json()) as { engine?: string; answer?: string; matches?: AskHit[]; error?: string };
      const rows = Array.isArray(data.matches) ? data.matches : [];
      setMatches(rows);
      setAskHighlight(rows.length ? highlightFrom(rows) : null);
      if (res.ok && data.answer) {
        setEngine(data.engine === "gemini" ? "gemini" : "search");
        await revealAnswer(data.answer, controller.signal);
        return;
      }
      if (!res.ok && data.error === "bad_request") {
        setError("Ask AI could not read that question.");
        return;
      }
      if (rows.length === 0) {
        setEngine("search");
        await revealAnswer(NOT_IN_THE_DATA, controller.signal);
        return;
      }
      await answerOnDevice(trimmed, rows, res.status === 429 || data.error === "quota");
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") setError("Ask AI could not answer that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-3">
      <section
        data-ask-ai-panel
        data-ask-open={open ? "yes" : "no"}
        className={`pointer-events-auto w-[min(42rem,calc(100vw-1.5rem))] origin-bottom border border-black bg-white text-black shadow-[0_18px_50px_-20px_rgba(0,0,0,0.45)] transition-all duration-300 ease-out ${open ? "rounded-3xl" : "rounded-full"}`}
        aria-label="Ask AI"
      >
        <form
          className="flex items-center gap-2 px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <SparkleIcon />
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
            className="min-w-0 flex-1 bg-white text-sm text-black outline-none placeholder:text-neutral-500 disabled:bg-white"
          />
          {open ? (
            <button type="button" className="text-xs font-semibold underline" onClick={close}>
              Close
            </button>
          ) : (
            <kbd className="rounded border border-black px-1.5 py-0.5 text-[10px] font-semibold">/</kbd>
          )}
          <button type="submit" disabled={busy || !question.trim()} aria-label="Ask" className="grid h-7 w-7 place-items-center rounded-full bg-black text-sm text-white disabled:bg-neutral-400">
            ↑
          </button>
        </form>
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden" inert={open ? undefined : true} aria-hidden={open ? undefined : true}>
            <div className="max-h-[min(32rem,calc(100dvh-8rem))] space-y-3 overflow-y-auto border-t border-black px-3 py-3">
              <p className="text-xs text-black">Answers use Campus Scout records. Gemini’s free tier answers first. If Gemini is unavailable, a small model runs in this browser.</p>
              {!asked && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide">Try</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ASK_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        className="rounded-full border border-black px-3 py-1 text-left text-xs font-medium hover:bg-black hover:text-white"
                        onClick={() => void ask(example)}
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
                        className="rounded-full border border-black px-2 py-0.5 text-[11px] font-medium hover:bg-black hover:text-white"
                        onClick={() => void ask(`${campus} founders`)}
                      >
                        {campus}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {webgpu === false && (
                <div className="border border-black px-3 py-2" data-ask-webgpu="no">
                  <p className="text-sm font-semibold">This browser can’t run the on-device model</p>
                  <p className="mt-1 text-xs leading-snug">WebGPU isn’t available on this browser or device. Ask still searches Campus Scout and lists the matching records.</p>
                </div>
              )}
              {webgpu !== false && (
                <details className="border border-black px-3 py-2">
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
                      className="w-full border border-black bg-white px-2 py-1.5 text-xs text-black"
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
                      className="bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:bg-neutral-400"
                    >
                      {loading ? "Loading…" : modelReady ? "Model ready" : `Load model (${formatDownload(model.bytes)})`}
                    </button>
                    {(loading || progressText) && (
                      <div>
                        <div className="h-2 border border-black" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                          <div className="h-full bg-black" style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
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
                  {busy && <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-black" />}
                </p>
              )}
              {asked && !busy && matches.length === 0 && !error && !answer && <p className="text-sm font-medium">{NOT_IN_THE_DATA}</p>}
              {matches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide">{matches.length} records</p>
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
                          className="h-full w-full rounded-2xl border border-black bg-white p-2 text-left shadow-sm hover:bg-black hover:text-white"
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
