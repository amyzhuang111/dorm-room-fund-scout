/** Point radius from stored campus signal count. Soft cap keeps Penn and Berkeley readable. */
export function markerRadius(signals: number): number {
  const count = Number.isFinite(signals) ? Math.max(0, signals) : 0;
  // Steeper mid-band; soft cap leaves room for Penn to edge Berkeley.
  return Math.round((2.6 + Math.min(8.2, Math.sqrt(count) * 0.415)) * 10) / 10;
}

/** Point radius from founder names on record — fold map dominant visual. */
export function markerRadiusByFounders(founders: number): number {
  const count = Number.isFinite(founders) ? Math.max(0, founders) : 0;
  // Penn 757 > Stanford 300 > MIT 238 stay distinct; soft cap for the field.
  return Math.round((3.1 + Math.min(10.8, Math.sqrt(count) * 0.33)) * 10) / 10;
}

export function markerSizeLegend(): string {
  return "Point size scales with founder names on record. Color is the campus country.";
}
