// Config-driven campus list. Adding a university means adding one entry here:
// seed-universities.ts writes it into SQLite, and the explore rail reads the
// same list for short labels and which campuses are first-class navigation.
// Coordinates must be sourced (see coordSource) — never invent a geocode.

export interface CampusConfig {
  id: string;
  name: string;
  shortLabel: string;
  aliases: string[];
  country: string;
  lat: number;
  lon: number;
  coordSource: string;
  /** Shown above the "More universities…" fold. */
  firstClass: boolean;
}

export const CAMPUSES: CampusConfig[] = [
  {
    id: "univ_penn",
    name: "University of Pennsylvania",
    shortLabel: "Penn",
    aliases: ["Penn", "UPenn"],
    country: "United States",
    lat: 39.951944,
    lon: -75.193611,
    coordSource: "en.wikipedia.org/wiki/University_of_Pennsylvania (wgCoordinates, retrieved 2026-09-18)",
    firstClass: true,
  },
  {
    id: "univ_berkeley",
    name: "University of California, Berkeley",
    shortLabel: "Berkeley",
    aliases: ["UC Berkeley", "Berkeley", "Cal"],
    country: "United States",
    lat: 37.8719,
    lon: -122.2583,
    coordSource: "en.wikipedia.org/wiki/University_of_California,_Berkeley (wgCoordinates, retrieved 2026-09-18)",
    firstClass: true,
  },
  {
    id: "univ_mit",
    name: "Massachusetts Institute of Technology",
    shortLabel: "MIT",
    aliases: ["MIT"],
    country: "United States",
    lat: 42.3597,
    lon: -71.0919,
    coordSource: "en.wikipedia.org/wiki/Massachusetts_Institute_of_Technology (wgCoordinates, retrieved 2026-09-18)",
    firstClass: false,
  },
  {
    id: "univ_stanford",
    name: "Stanford University",
    shortLabel: "Stanford",
    aliases: ["Stanford"],
    country: "United States",
    lat: 37.4275,
    lon: -122.17,
    coordSource: "en.wikipedia.org/wiki/Stanford_University (wgCoordinates, retrieved 2026-09-18)",
    firstClass: false,
  },
  {
    id: "univ_waterloo",
    name: "University of Waterloo",
    shortLabel: "Waterloo",
    aliases: ["Waterloo", "UWaterloo"],
    country: "Canada",
    lat: 43.476944,
    lon: -80.554722,
    coordSource: "en.wikipedia.org/wiki/University_of_Waterloo (wgCoordinates, retrieved 2026-09-18)",
    firstClass: false,
  },
  {
    id: "univ_harvard",
    name: "Harvard University",
    shortLabel: "Harvard",
    aliases: ["Harvard"],
    country: "United States",
    lat: 42.374444,
    lon: -71.116944,
    coordSource: "en.wikipedia.org/wiki/Harvard_University (wgCoordinates via MediaWiki API, retrieved 2026-09-21)",
    firstClass: false,
  },
  {
    id: "univ_columbia",
    name: "Columbia University",
    shortLabel: "Columbia",
    aliases: ["Columbia"],
    country: "United States",
    lat: 40.8075,
    lon: -73.96194444,
    coordSource: "en.wikipedia.org/wiki/Columbia_University (MediaWiki coordinates API, retrieved 2026-09-25)",
    firstClass: false,
  },
  {
    id: "univ_gatech",
    name: "Georgia Institute of Technology",
    shortLabel: "Georgia Tech",
    aliases: ["Georgia Tech", "GT"],
    country: "United States",
    lat: 33.776,
    lon: -84.396,
    coordSource: "en.wikipedia.org/wiki/Georgia_Tech (MediaWiki coordinates API, retrieved 2026-09-25)",
    firstClass: false,
  },
  {
    id: "univ_michigan",
    name: "University of Michigan",
    shortLabel: "Michigan",
    aliases: ["Michigan", "UMich"],
    country: "United States",
    lat: 42.27694444,
    lon: -83.73805556,
    coordSource: "en.wikipedia.org/wiki/University_of_Michigan (MediaWiki coordinates API, retrieved 2026-09-25)",
    firstClass: false,
  },
  {
    id: "univ_princeton",
    name: "Princeton University",
    shortLabel: "Princeton",
    aliases: ["Princeton"],
    country: "United States",
    lat: 40.34527778,
    lon: -74.65611111,
    coordSource: "en.wikipedia.org/wiki/Princeton_University (MediaWiki coordinates API, retrieved 2026-09-25)",
    firstClass: false,
  },
];

export function campusById(id: string): CampusConfig | undefined {
  return CAMPUSES.find((c) => c.id === id);
}

export function shortCampusLabel(id: string, fallback?: string): string {
  return campusById(id)?.shortLabel ?? fallback ?? id;
}

export function shortCampusName(name: string): string {
  return CAMPUSES.find((c) => c.name === name)?.shortLabel ?? name;
}
