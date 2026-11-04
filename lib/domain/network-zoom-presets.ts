/**
 * Five camera stops for the Campus Scout network map.
 *
 * Wide / Overview: whole ecosystem, matching the two far-out references.
 * Clusters: campus groups and program hubs, matching the mid reference.
 * Connections / Founders: individual ties, cards and tracking boxes.
 *
 * Scales are mapped to OrbitControls distance by networks-graph-3d.tsx.
 * Do not rewrite records or imply that project team members are founders.
 */
export const NETWORK_ZOOM_PRESETS = [
  { id: "wide", label: "Wide", scale: 0.76, detail: "Entire ecosystem" },
  { id: "overview", label: "Overview", scale: 1.14, detail: "Major campus clusters" },
  { id: "clusters", label: "Campuses", scale: 1.88, detail: "Campus and fund hubs" },
  { id: "connections", label: "Connections", scale: 2.77, detail: "Founder links and cards" },
  { id: "founders", label: "Founders", scale: 4.24, detail: "Individual founder relationships" },
] as const;

export type NetworkZoomPreset = (typeof NETWORK_ZOOM_PRESETS)[number];
export type NetworkZoomPresetId = NetworkZoomPreset["id"];
export function closestNetworkZoomPreset(scale: number): NetworkZoomPreset {
  return NETWORK_ZOOM_PRESETS.reduce((best, item) =>
    Math.abs(item.scale - scale) < Math.abs(best.scale - scale) ? item : best
  );
}
