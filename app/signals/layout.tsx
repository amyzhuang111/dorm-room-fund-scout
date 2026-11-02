import { DataTheme } from "@/components/data-theme";

/** Force Halflight white on /signals and /signals/sources — dark navy is banned. */
export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sample-paper min-h-[100dvh] bg-[color:var(--bg,#FFFFFF)] text-[color:var(--fg,#0B0E17)]" data-signals-shell="">
      <DataTheme />
      {children}
    </div>
  );
}
