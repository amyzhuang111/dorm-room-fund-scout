import { campusSealLetters } from "@/lib/domain/campus-seal";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "h-5 w-5 text-[8px]",
  md: "h-6 w-6 text-[9px]",
  lg: "h-8 w-8 text-[10px]",
};

/**
 * Campus Scout owned mark: typographic campus seal.
 * Cobalt ink on white, thin double-rule frame  -  not a logo, not orange.
 */
export function CampusSeal({
  label,
  title,
  size = "md",
  className = "",
}: {
  label: string | null | undefined;
  /** Accessible name; defaults to label */
  title?: string | null;
  size?: Size;
  className?: string;
}) {
  const letters = campusSealLetters(label);
  if (!letters) return null;
  const tip = (title || label || "").trim();
  return (
    <span
      className={`campus-seal inline-grid shrink-0 place-items-center rounded-[2px] border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg,#FFFFFF)] font-mono font-bold uppercase leading-none tracking-tight text-[color:var(--cobalt,#2F4FD8)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--cobalt,#2F4FD8)_22%,transparent)] ${SIZE[size]} ${className}`}
      data-campus-seal={letters}
      title={tip || undefined}
      aria-label={tip ? `Campus ${tip}` : undefined}
    >
      {letters}
    </span>
  );
}
