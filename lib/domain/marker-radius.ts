/** Point radius from stored campus signal count. Soft cap keeps Penn and Berkeley readable. */
export function markerRadius(signals: number): number {
  const count = Number.isFinite(signals) ? Math.max(0, signals) : 0;
  return Math.round((2.6 + Math.min(8.0, Math.sqrt(count) * 0.38)) * 10) / 10;
}

export function markerSizeLegend(): string {
  return "Point size scales with stored campus signals.";
}
