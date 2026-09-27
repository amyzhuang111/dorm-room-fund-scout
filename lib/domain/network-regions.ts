// Dorm Room Fund's four recruiting teams, from dormroomfund.com/join, plus
// International for campuses outside the US. Schools not in the config yet
// still land in the right team by name.

export interface RegionDef {
  id: string;
  /** Official team name, drawn outside the cluster and used in the legend. */
  label: string;
  /** Same official name, shown in full on hover. */
  fullLabel: string;
  /** Base hue for this region's color family. */
  hue: number;
}

export const REGIONS: RegionDef[] = [
  { id: "boston", label: "Boston & Northeast", fullLabel: "Boston & Northeast", hue: 252 },
  { id: "ny", label: "NY & Midwest", fullLabel: "NY & Midwest", hue: 38 },
  { id: "philly", label: "Philadelphia & Southeast", fullLabel: "Philadelphia & Southeast", hue: 354 },
  { id: "west", label: "SF & West Coast", fullLabel: "SF & West Coast", hue: 188 },
  { id: "international", label: "International", fullLabel: "International", hue: 312 },
];

const REGION_BY_ID = new Map(REGIONS.map((region) => [region.id, region]));

/** Known campuses. Anything else is matched by name, then treated as international. */
const CAMPUS_REGION: Record<string, string> = {
  univ_mit: "boston",
  univ_harvard: "boston",
  univ_brown: "boston",
  univ_yale: "ny",
  univ_cornell: "ny",
  univ_nyu: "ny",
  univ_columbia: "ny",
  univ_michigan: "ny",
  univ_notredame: "ny",
  univ_penn: "philly",
  univ_lafayette: "philly",
  univ_princeton: "philly",
  univ_cmu: "philly",
  univ_duke: "philly",
  univ_gatech: "philly",
  univ_uva: "philly",
  univ_stanford: "west",
  univ_berkeley: "west",
  univ_hmc: "west",
  univ_utexas: "west",
  univ_waterloo: "international",
  univ_toronto: "international",
  univ_queens: "international",
  univ_laurentian: "international",
  univ_cambridge: "international",
};

const NAME_RULES: [RegExp, string][] = [
  [/waterloo|toronto|queen'?s university|laurentian|mcgill|university of british columbia|\bubc\b|university of alberta|cambridge|oxford|imperial college|london school of economics/i, "international"],
  [/massachusetts institute|\bmit\b|harvard|\bbrown\b|tufts|boston college|boston university|northeastern university|dartmouth|wellesley|amherst college|williams college|bowdoin|middlebury|brandeis|babson/i, "boston"],
  [/yale|cornell|new york university|\bnyu\b|columbia university|fordham|cooper union|rensselaer|syracuse university|university of rochester|michigan|notre dame|northwestern|university of chicago|purdue|\buiuc\b|university of illinois|wisconsin|minnesota|ohio state|university of iowa|indiana university|case western/i, "ny"],
  [/pennsylvania|\bpenn\b|drexel|villanova|swarthmore|haverford|temple university|lehigh|lafayette|princeton|carnegie mellon|rutgers|duke|georgia tech|georgia institute|university of virginia|\buva\b|north carolina|emory|vanderbilt|university of florida|georgetown|george washington|johns hopkins|washington university|washu|tulane|clemson|university of maryland|university of miami|university of georgia/i, "philly"],
  [/stanford|berkeley|harvey mudd|\bucla\b|southern california|\busc\b|caltech|uc san diego|uc irvine|pomona college|university of washington|oregon state|university of oregon|university of texas|ut austin|rice university|arizona state|university of arizona|university of colorado|university of utah|university of hawaii/i, "west"],
];

export function regionForCampus(id: string, label = ""): string {
  const known = CAMPUS_REGION[id];
  if (known) return known;
  const text = `${label} ${id}`.replace(/[_-]+/g, " ");
  for (const [pattern, region] of NAME_RULES) if (pattern.test(text)) return region;
  return "international";
}

export function regionDef(id: string): RegionDef {
  return REGION_BY_ID.get(id) ?? REGIONS[REGIONS.length - 1];
}

/** Dark, readable ink for a region label on white. */
export function regionInk(regionId: string): string {
  return hslToHex(regionDef(regionId).hue, 72, 28);
}

/** One shade per campus inside a region, same family, different enough to tell apart. */
export function campusShade(id: string, label: string, siblings: { id: string; label: string }[]): string {
  const regionId = regionForCampus(id, label);
  const family = siblings
    .filter((campus) => regionForCampus(campus.id, campus.label) === regionId)
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const index = Math.max(0, family.findIndex((campus) => campus.id === id));
  const count = Math.max(family.length, 1);
  const spread = Math.min(7, 28 / count);
  const hue = regionDef(regionId).hue + (index - (count - 1) / 2) * spread;
  const light = 30 + (count === 1 ? 8 : (index / (count - 1)) * 16);
  return hslToHex(((hue % 360) + 360) % 360, 76, light);
}

export interface WedgeSeat {
  id: string;
  x: number;
  y: number;
  angle: number;
  regionId: string;
  wedgeStart: number;
  wedgeSpan: number;
  sliceHalf: number;
}

export interface RegionMarker {
  id: string;
  label: string;
  fullLabel: string;
  x: number;
  y: number;
  color: string;
  campusIds: string[];
}

/** Starting seats only. Campuses in one region begin next to each other. The force layout is free to move them. */
export function placeCampuses(campuses: { id: string; label: string }[], discRadius: number): { seats: Map<string, WedgeSeat>; markers: RegionMarker[] } {
  const byRegion = new Map<string, { id: string; label: string }[]>();
  for (const campus of campuses) {
    const region = regionForCampus(campus.id, campus.label);
    const list = byRegion.get(region) ?? [];
    list.push(campus);
    byRegion.set(region, list);
  }
  const active = REGIONS.filter((region) => (byRegion.get(region.id)?.length ?? 0) > 0);
  const weights = active.map((region) => Math.max(1.35, Math.sqrt(byRegion.get(region.id)?.length ?? 1)));
  const weightSum = weights.reduce((sum, value) => sum + value, 0) || 1;
  const seats = new Map<string, WedgeSeat>();
  const markers: RegionMarker[] = [];
  let angle = -Math.PI / 2;
  active.forEach((region, index) => {
    const span = (weights[index] / weightSum) * Math.PI * 2;
    const members = [...(byRegion.get(region.id) ?? [])].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    const mid = angle + span / 2;
    const centerX = Math.cos(mid) * discRadius;
    const centerY = Math.sin(mid) * discRadius;
    const tangentX = Math.cos(mid + Math.PI / 2);
    const tangentY = Math.sin(mid + Math.PI / 2);
    members.forEach((campus, seat) => {
      const along = (seat - (members.length - 1) / 2) * 52;
      const inward = (seat % 2) * 28;
      const x = centerX + tangentX * along - Math.cos(mid) * inward;
      const y = centerY + tangentY * along - Math.sin(mid) * inward;
      seats.set(campus.id, {
        id: campus.id,
        x,
        y,
        angle: Math.atan2(y, x),
        regionId: region.id,
        wedgeStart: angle,
        wedgeSpan: span,
        sliceHalf: 0.2,
      });
    });
    const labelRadius = discRadius * 1.35;
    markers.push({
      id: region.id,
      label: region.label,
      fullLabel: region.fullLabel,
      x: Math.cos(mid) * labelRadius,
      y: Math.sin(mid) * labelRadius,
      color: regionInk(region.id),
      campusIds: members.map((member) => member.id),
    });
    angle += span;
  });
  return { seats, markers };
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const sat = saturation / 100;
  const light = lightness / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = hue / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hp < 1) [red, green, blue] = [chroma, x, 0];
  else if (hp < 2) [red, green, blue] = [x, chroma, 0];
  else if (hp < 3) [red, green, blue] = [0, chroma, x];
  else if (hp < 4) [red, green, blue] = [0, x, chroma];
  else if (hp < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  const match = light - chroma / 2;
  const channel = (value: number) => Math.round((value + match) * 255).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}
