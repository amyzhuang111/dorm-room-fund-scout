import Link from "next/link";

export function EmptyHome() {
  return (
    <section className="hero-night flex min-h-[calc(100dvh-72px)] flex-col justify-center px-6 py-16">
      <h1 className="max-w-[16ch] text-[36px] font-semibold leading-[1.08] tracking-[-0.03em] lg:text-[52px]">
        Track student founders before they raise
      </h1>
      <p className="mt-4 max-w-[36ch] text-[16px] leading-6 text-fg-2">This page stays empty until you open sample data.</p>
      <Link href="/?sample=1" className="mt-8 inline-flex h-12 w-fit items-center rounded bg-ember px-6 text-[16px] font-semibold text-[#0b0e17]">
        Sample data
      </Link>
    </section>
  );
}
