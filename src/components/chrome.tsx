"use client";

import Link from "next/link";

export function Chrome({ active }: { active: "work" | "founders" }) {
  const item = (href: "/" | "/founders", id: "work" | "founders", label: string) => (
    <Link
      href={href}
      className={
        active === id
          ? "text-sm font-medium text-[#16181d]"
          : "text-sm text-[#5c6370] hover:text-[#16181d]"
      }
      aria-current={active === id ? "page" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-4 border-b border-[#e6e8ef] bg-white px-4">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
        <span className="size-2.5 rounded-full bg-[#2f4fd8]" />
        Campus Scout
      </Link>
      {item("/", "work", "Work")}
      {item("/founders", "founders", "Founders")}
    </header>
  );
}
