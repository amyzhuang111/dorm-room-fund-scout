const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const THROUGH_YM = "2026-10";

export type PeakBar = { id: string; label: string; short: string; count: number; peak: boolean };

export type PeakShell = {
  bars: PeakBar[];
  dated: number;
  inWindow: number;
  earlierValid: number;
  undatedMonth: number;
  quiet: number;
  /** Companies with signals but no usable source_date (neither dated nor quiet). */
  noDate: number;
  peakCount: number;
  peakId: string;
  peakLabel: string;
};

type SignalRow = { latestSignalAt?: string | null; signals?: number };

/** Server + client: peak share from directory cards. latestSignalAt is source_date only. */
export function buildPeakShell(rows: SignalRow[]): PeakShell | null {
  const months = new Map<string, number>();
  let dated = 0;
  let undatedMonth = 0;
  let quiet = 0;
  let noDate = 0;
  for (const row of rows) {
    if ((row.signals ?? 0) === 0) quiet += 1;
    const at = row.latestSignalAt;
    if (!at || at.length < 7) {
      if ((row.signals ?? 0) > 0) noDate += 1;
      continue;
    }
    dated += 1;
    const ym = at.slice(0, 7);
    if (ym.endsWith("-00")) {
      undatedMonth += 1;
      continue;
    }
    if (ym > THROUGH_YM) continue;
    months.set(ym, (months.get(ym) ?? 0) + 1);
  }
  const sorted = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const slice = sorted.slice(-9);
  const earlierValid = sorted.slice(0, Math.max(0, sorted.length - 9)).reduce((sum, [, n]) => sum + n, 0);
  const inWindow = slice.reduce((sum, [, n]) => sum + n, 0);
  const bars: PeakBar[] = slice.map(([id, count]) => {
    const y = id.slice(0, 4);
    const m = Number(id.slice(5, 7));
    const short = MONTH_SHORT[m - 1] ?? id.slice(5, 7);
    return { id, label: `${short} ${y}`, short, count, peak: false };
  });
  if (!bars.length || dated === 0) return null;
  const max = Math.max(1, ...bars.map((b) => b.count));
  for (const b of bars) b.peak = b.count === max;
  const peakBar = bars.find((b) => b.peak)!;
  return {
    bars,
    dated,
    inWindow,
    earlierValid,
    undatedMonth,
    quiet,
    noDate,
    peakCount: peakBar.count,
    peakId: peakBar.id,
    peakLabel: peakBar.label,
  };
}
