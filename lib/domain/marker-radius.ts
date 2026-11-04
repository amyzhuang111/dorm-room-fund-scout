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

/**
 * Point radius from PitchBook undergraduate founder counts.
 * 2,500 is the scale ceiling so Berkeley (about 2,380) stays larger than Penn (about 1,466).
 */
export function markerRadiusByPitchbook(founders: number): number {
  const count = Number.isFinite(founders) ? Math.max(0, founders) : 0;
  if (count <= 0) return 3.2;
  const t = Math.min(1, count / 2500);
  return Math.round((3.4 + t * 8.2) * 10) / 10;
}

/** PitchBook size when the school is on that list. File-only dots stay smaller than a top-20 PitchBook marker. */
export function markerRadiusForCampus(fileFounders: number, pitchbookFounders: number | null | undefined): number {
  if (pitchbookFounders != null && pitchbookFounders > 0) return markerRadiusByPitchbook(pitchbookFounders);
  const count = Number.isFinite(fileFounders) ? Math.max(0, fileFounders) : 0;
  return Math.round((3.1 + Math.min(3.6, Math.sqrt(count) * 0.18)) * 10) / 10;
}

export function markerSizeLegend(): string {
  return "Point size follows PitchBook undergraduate founder counts when the school is on that list, and founders on file otherwise. Color is the campus country.";
}
