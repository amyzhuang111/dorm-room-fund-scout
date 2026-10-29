/** Point radius from stored campus signal count. Soft cap keeps Penn and Berkeley readable. */
export function markerRadius(signals: number): number {
  const count = Number.isFinite(signals) ? Math.max(0, signals) : 0;
  // Steeper mid-band; soft cap leaves room for Penn to edge Berkeley.
  return Math.round((2.6 + Math.min(8.2, Math.sqrt(count) * 0.415)) * 10) / 10;
}

export function markerSizeLegend(): string {
  return "Point size scales with stored campus signals. Ember marks the top desk.";
}
