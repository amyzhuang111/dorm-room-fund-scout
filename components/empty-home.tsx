import Link from "next/link";

export function EmptyHome() {
  return (
    <div className="hero-night min-h-[calc(100dvh-48px)] bg-bg px-6 pb-16 pt-14 text-fg">
      <h1 className="max-w-[12ch] text-[44px] leading-[48px] tracking-[-0.03em] sm:text-[56px] sm:leading-[60px]">
        Track student founders before they raise
      </h1>
      <p className="mt-4 max-w-[28rem] text-[16px] leading-6 text-fg-2">
        The campus map, the people on it, and recent signals.
      </p>
      <Link href="/?sample=1" className="mt-8 inline-flex h-12 items-center rounded bg-ember px-6 text-[16px] font-semibold text-accent-foreground">
        Sample data
      </Link>
    </div>
  );
}
