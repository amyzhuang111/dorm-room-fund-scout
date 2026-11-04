import type { Metadata } from "next";
import { AskResult } from "@/components/ask-result";

export const metadata: Metadata = { title: "Ask" };

export default async function AskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-[720px] px-5 py-12">
      <h1 className="sr-only">Ask Campus Scout</h1>
      <p className="micro">Ask</p>
      <AskResult question={sp.q?.trim() ?? ""} />
    </div>
  );
}
