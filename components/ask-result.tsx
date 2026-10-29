"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { parseAskIntent } from "@/lib/domain/ask-intent";
import type { AskHit } from "@/lib/domain/ask-types";

export function AskResult({ question }: { question: string }) {
  const router = useRouter();
  const intent = question ? parseAskIntent(question) : null;
  const [answer, setAnswer] = useState<string | null>(null);
  const [matches, setMatches] = useState<AskHit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [forQuestion, setForQuestion] = useState(question);
  if (forQuestion !== question) {
    setForQuestion(question);
    setAnswer(null);
    setMatches([]);
    setNote(null);
  }

  useEffect(() => {
    if (!question) return;
    let cancel = false;
    fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { answer?: string; matches?: AskHit[]; error?: string };
        if (cancel) return;
        setMatches(data.matches ?? []);
        if (data.answer) setAnswer(data.answer);
        else if (data.error === "no_key" || data.error === "quota") setNote("The model is unavailable. Matching records are listed from the workspace.");
        else setNote("No generated answer came back. Matching records are listed below when the search found them.");
      })
      .catch(() => {
        if (!cancel) setNote("Ask could not reach the server.");
      });
    return () => {
      cancel = true;
    };
  }, [question]);

  const chips = intent
    ? [
        intent.campus ? ["Campus", intent.campus] : null,
        intent.stage ? ["Stage", intent.stage] : null,
        intent.sector ? ["Sector", intent.sector] : null,
        intent.year ? ["Year", String(intent.year)] : null,
        intent.confirmedOnly ? ["Verified", "confirmed"] : null,
      ].filter((item): item is [string, string] => Boolean(item))
    : [];

  if (!question) {
    return <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em]">Ask a question about this workspace.</h2>;
  }

  return (
    <div>
      <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em]">{question}</h2>
      <div className="mt-6 text-[15px] leading-6 text-fg">
        {answer ?? <p className="text-fg-3">Reading the records…</p>}
        {note && <p className="mt-3 text-fg-2">{note}</p>}
      </div>
      {matches.length > 0 && (
        <ol className="mt-6 space-y-2 text-[14px]">
          {matches.slice(0, 12).map((hit, index) => (
            <li key={hit.id}>
              <Link href={hit.href} className="text-cobalt">[{index + 1}] {hit.name}</Link>
              <span className="text-fg-2"> {hit.detail}</span>
            </li>
          ))}
        </ol>
      )}
      {chips.length > 0 && (
        <div className="mt-8">
          <p className="micro">How I read this</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map(([label, value]) => (
              <button
                key={label}
                type="button"
                className="rounded bg-[var(--cobalt-haze)] px-2 py-1 text-[13px] text-fg"
                onClick={() => router.push(`/ask?q=${encodeURIComponent(`${label} ${value}`)}`)}
              >
                {label} = {value}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
