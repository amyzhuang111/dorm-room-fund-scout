import { AskResult } from "@/components/ask-result";

export default async function AskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-[720px] px-5 py-12">
      <p className="micro">Ask</p>
      <AskResult question={sp.q?.trim() ?? ""} />
    </div>
  );
}
