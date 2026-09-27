"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { ASK_BROWSER_MODELS, ASK_DEFAULT_MODEL_ID, formatDownload } from "@/lib/domain/ask-browser-models";
import { ASK_SYSTEM_PROMPT, askUserPrompt, fallbackAnswer, NOT_IN_THE_DATA } from "@/lib/domain/ask-prompt";
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

interface AskAiControls {
  open: boolean;
  toggle: () => void;
}

const AskAiContext = createContext<AskAiControls | null>(null);

// Survives closing the panel so a downloaded model stays loaded.
let browserWorker: Worker | null = null;
let browserEngine: WebWorkerMLCEngine | null = null;
let browserModelId: string | null = null;

export function AskAiProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const onAskSurface = pathname === "/" || pathname === "/founder/network";
  const [trackedPath, setTrackedPath] = useState(pathname);
  if (pathname !== trackedPath) {
    setTrackedPath(pathname);
    if (!onAskSurface) setOpen(false);
  }
  const visible = open && onAskSurface;

  const controls = useMemo<AskAiControls>(
    () => ({
      open,
      toggle: () => setOpen((value) => !value),
    }),
    [open]
  );

  return (
    <AskAiContext.Provider value={controls}>
      {children}
      {visible && <AskAiPanel onClose={() => setOpen(false)} />}
    </AskAiContext.Provider>
  );
}

export function AskAiButton() {
  const controls = useContext(AskAiContext);
  if (!controls) return null;
  return (
    <button
      type="button"
      data-ask-ai-button
      className={`shrink-0 rounded-md border border-black px-2.5 py-1 text-xs font-semibold ${controls.open ? "bg-black text-white" : "bg-white text-black"}`}
      aria-pressed={controls.open}
      aria-expanded={controls.open}
      onClick={controls.toggle}
    >
      Ask AI
    </button>
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

function AskAiPanel({ onClose }: { onClose: () => void }) {
  const [serverConfigured, setServerConfigured] = useState(false);
  const [webgpu, setWebgpu] = useState<boolean | null>(null);
  const [modelId, setModelId] = useState(ASK_DEFAULT_MODEL_ID);
  const [loadedId, setLoadedId] = useState<string | null>(browserModelId);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [matches, setMatches] = useState<AskHit[]>([]);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const model = ASK_BROWSER_MODELS.find((item) => item.id === modelId) ?? ASK_BROWSER_MODELS[0];
  const usingServer = modelId === "server";
  const modelReady = !usingServer && loadedId === modelId && browserEngine != null;

  useEffect(() => {
    let cancel = false;
    fetch("/api/ask")
      .then((res) => res.json())
      .then((data: { serverConfigured?: boolean; configured?: boolean }) => {
        if (!cancel) setServerConfigured(data.serverConfigured === true || data.configured === true);
      })
      .catch(() => {
        if (!cancel) setServerConfigured(false);
      });
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) {
      Promise.resolve().then(() => {
        if (!cancel) setWebgpu(false);
      });
    } else {
      gpu
        .requestAdapter()
        .then((adapter) => {
          if (!cancel) setWebgpu(adapter != null);
        })
        .catch(() => {
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

  function close() {
    abortRef.current?.abort();
    setAskHighlight(null);
    onClose();
  }

  async function loadModel() {
    if (loading || webgpu === false || usingServer) return;
    setError(null);
    setLoading(true);
    setProgress(0);
    setProgressText("Starting download…");
    try {
      const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
      if (!browserWorker) {
        browserWorker = new Worker(new URL("./ask-ai.worker.ts", import.meta.url), { type: "module" });
      }
      const onProgress = (report: { progress: number; text: string }) => {
        setProgress(report.progress);
        setProgressText(report.text);
      };
      if (!browserEngine) {
        browserEngine = await CreateWebWorkerMLCEngine(browserWorker, modelId, { initProgressCallback: onProgress });
      } else if (browserModelId !== modelId) {
        setProgressText("Switching model…");
        await browserEngine.reload(modelId);
      }
      browserModelId = modelId;
      setLoadedId(modelId);
      setProgress(1);
      setProgressText("Model ready. It stays cached in this browser.");
    } catch (err) {
      browserEngine = null;
      browserModelId = null;
      setLoadedId(null);
      const message = err instanceof Error ? err.message : "";
      setError(message || "The model could not load. Search results still work.");
    } finally {
      setLoading(false);
    }
  }

  async function askServer(trimmed: string, signal: AbortSignal) {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: trimmed }),
      signal,
    });
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/event-stream")) {
      if (res.status === 429) {
        setError("The server model is rate limited. The in-browser model has no limit.");
        return;
      }
      setError("The server model is unavailable. Pick an in-browser model instead.");
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      setError("The server model is unavailable.");
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let textOut = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk.split("\n").find((item) => item.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as { type?: string; text?: string; matches?: AskHit[]; message?: string };
        if (event.type === "text" && event.text) {
          textOut += event.text;
          setAnswer(textOut);
        } else if (event.type === "matches" && Array.isArray(event.matches)) {
          setMatches(event.matches);
          setAskHighlight(event.matches.length ? highlightFrom(event.matches) : null);
        } else if (event.type === "error") {
          setError(event.message ?? "Ask AI could not finish that question.");
        }
      }
    }
    if (!textOut.trim()) setAnswer(NOT_IN_THE_DATA);
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setQuestion(trimmed);
    setAnswer("");
    setMatches([]);
    setAsked(true);
    setError(null);
    setAskHighlight(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      if (usingServer) {
        await askServer(trimmed, controller.signal);
        return;
      }
      const res = await fetch("/api/ask/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });
      if (!res.ok) {
        setError("Campus Scout search failed.");
        return;
      }
      const data = (await res.json()) as { matches?: AskHit[] };
      const rows = Array.isArray(data.matches) ? data.matches : [];
      setMatches(rows);
      setAskHighlight(rows.length ? highlightFrom(rows) : null);
      if (rows.length === 0) {
        setAnswer(NOT_IN_THE_DATA);
        return;
      }
      if (webgpu === false) {
        setAnswer(fallbackAnswer(rows));
        return;
      }
      if (!browserEngine || browserModelId !== modelId) {
        setAnswer(`${fallbackAnswer(rows)} Load the model to write a short answer from these records.`);
        return;
      }
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
      if (!textOut.trim()) setAnswer(fallbackAnswer(rows));
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") setError("Ask AI could not answer that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      data-ask-ai-panel
      className="fixed right-3 top-16 z-40 flex w-[min(24rem,calc(100vw-1.5rem))] max-h-[min(40rem,calc(100dvh-5.5rem))] flex-col border border-black bg-white text-black shadow-lg"
      aria-label="Ask AI"
    >
      <div className="flex items-center justify-between border-b border-black px-3 py-2">
        <h2 className="text-sm font-semibold">Ask AI</h2>
        <button type="button" className="text-xs font-semibold underline" onClick={close}>
          Close
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <p className="text-xs text-black">Answers use Campus Scout records. The model runs in your browser, free of charge.</p>
        {webgpu === false && (
          <div className="border border-black px-3 py-2" data-ask-webgpu="no">
            <p className="text-sm font-semibold">This browser can’t run the on-device model</p>
            <p className="mt-1 text-xs leading-snug">WebGPU isn’t available on this browser or device. Ask still searches Campus Scout and lists the matching records.</p>
          </div>
        )}
        {webgpu !== false && (
          <div className="space-y-2">
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
              {serverConfigured && <option value="server">Server model</option>}
            </select>
            {!usingServer && (
              <>
                <button
                  type="button"
                  data-ask-ai-load
                  disabled={loading || modelReady}
                  onClick={() => void loadModel()}
                  className="bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:bg-neutral-400"
                >
                  {loading ? "Loading…" : modelReady ? "Model ready" : `Load model (${formatDownload(model.bytes)})`}
                </button>
                <p className="text-[11px] leading-snug">Download {formatDownload(model.bytes)}. The browser caches it after the first time.</p>
                {(loading || progressText) && (
                  <div>
                    <div className="h-2 border border-black" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                      <div className="h-full bg-black" style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] leading-snug">{progressText}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide">Try</p>
          <ul className="mt-1 space-y-1">
            {ASK_EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  className="w-full rounded-full border border-black px-2.5 py-1 text-left text-xs font-medium hover:bg-black hover:text-white"
                  onClick={() => void ask(example)}
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide">Campuses</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {ASK_CAMPUS_SUGGESTIONS.map((campus) => (
              <li key={campus}>
                <button
                  type="button"
                  className="rounded-full border border-black px-2 py-0.5 text-left text-[11px] font-medium hover:bg-black hover:text-white"
                  onClick={() => void ask(`${campus} founders`)}
                >
                  {campus}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <label htmlFor="ask-ai-q" className="sr-only">
            Question
          </label>
          <textarea
            id="ask-ai-q"
            rows={3}
            value={question}
            disabled={busy}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="juniors building in AI"
            className="w-full resize-none border border-black bg-white px-2 py-1.5 text-sm text-black placeholder:text-neutral-500 disabled:bg-neutral-100"
          />
          <button type="submit" disabled={busy || !question.trim()} className="mt-2 bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:bg-neutral-400">
            {busy ? "Answering…" : "Ask"}
          </button>
        </form>
        {error && <p className="text-sm font-medium">{error}</p>}
        {busy && !answer && <p className="text-sm">Searching Campus Scout…</p>}
        {answer && (
          <p className="text-sm leading-snug" data-ask-ai-answer>
            {answer}
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
            <ul className="mt-1 border-t border-black">
              {matches.map((hit) => (
                <li key={`${hit.kind}:${hit.id}`} className="border-b border-black/20">
                  <button
                    type="button"
                    className="w-full px-1 py-2 text-left hover:bg-neutral-100"
                    onClick={() => {
                      const next = highlightFrom(matches);
                      next.focusId = hit.id;
                      next.focusCampus = hit.campuses[0] ?? null;
                      setAskHighlight(next);
                    }}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{hit.kind}</span>
                    <span className="block text-sm font-semibold">{hit.name}</span>
                    {hit.detail && <span className="mt-0.5 block text-xs leading-snug">{hit.detail}</span>}
                  </button>
                  <div className="flex flex-wrap gap-3 px-1 pb-2 text-xs">
                    <Link href={hit.href} className="font-semibold underline">
                      Record
                    </Link>
                    {hit.sources
                      .filter((source) => source.url.startsWith("http"))
                      .slice(0, 2)
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
    </aside>
  );
}
