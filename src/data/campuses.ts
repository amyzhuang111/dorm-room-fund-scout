export type ListRank = {
  rank: number;
  founderCount: number;
  companyCount: number;
};

export type Coverage = "not_scanned" | "partial" | "up_to_date";

export type Campus = {
  id: string;
  name: string;
  shortName: string;
  country: string | null;
  coverage: Coverage;
  founderCount: number;
  companyCount: number;
  candidateProjectCount: number;
  resolvedPersonCount: number;
  sourcesConfigured: number;
  lastCheckedAt: string | null;
  undergrad: ListRank | null;
  grad: ListRank | null;
  mba: ListRank | null;
};

/** Public shortlist snapshot. Data through Nov 2, 2026. */
export const FILE_AS_OF = "Nov 2, 2026";
export const SOURCE_URL =
  "https://campus-scout-git-main-amys-projects-d3dfb125.vercel.app/work/shortlist";

export const campuses: Campus[] = [
  {
    "id": "univ_adelphi_university",
    "name": "Adelphi University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Adelphi"
  },
  {
    "id": "univ_acphs",
    "name": "Albany College of Pharmacy and Health Sciences",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Albany College of Pharmacy and Health Sciences"
  },
  {
    "id": "univ_albany_law",
    "name": "Albany Law School",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Albany Law School"
  },
  {
    "id": "univ_alfred",
    "name": "Alfred University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Alfred"
  },
  {
    "id": "univ_asu",
    "name": "Arizona State University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 3,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 3,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 60,
      "founderCount": 368,
      "companyCount": 348
    },
    "grad": {
      "rank": 48,
      "founderCount": 408,
      "companyCount": 365
    },
    "mba": {
      "rank": 27,
      "founderCount": 196,
      "companyCount": 190
    },
    "shortName": "ASU"
  },
  {
    "id": "univ_babson_college",
    "name": "Babson College",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 21,
    "companyCount": 16,
    "candidateProjectCount": 16,
    "resolvedPersonCount": 22,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T07:55:07.279Z",
    "undergrad": null,
    "grad": {
      "rank": 68,
      "founderCount": 325,
      "companyCount": 298
    },
    "mba": {
      "rank": 18,
      "founderCount": 288,
      "companyCount": 265
    },
    "shortName": "Babson"
  },
  {
    "id": "univ_barnard_college",
    "name": "Barnard College",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 2,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 3,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Barnard"
  },
  {
    "id": "univ_baylor",
    "name": "Baylor University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Baylor"
  },
  {
    "id": "univ_bentley",
    "name": "Bentley University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 9,
    "companyCount": 6,
    "candidateProjectCount": 6,
    "resolvedPersonCount": 9,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T07:55:07.279Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Bentley"
  },
  {
    "id": "univ_bc",
    "name": "Boston College",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 22,
    "companyCount": 12,
    "candidateProjectCount": 12,
    "resolvedPersonCount": 24,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T04:53:34.141Z",
    "undergrad": {
      "rank": 77,
      "founderCount": 321,
      "companyCount": 305
    },
    "grad": null,
    "mba": null,
    "shortName": "Boston College"
  },
  {
    "id": "univ_bu",
    "name": "Boston University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 24,
    "companyCount": 14,
    "candidateProjectCount": 14,
    "resolvedPersonCount": 30,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T07:55:07.279Z",
    "undergrad": {
      "rank": 37,
      "founderCount": 547,
      "companyCount": 526
    },
    "grad": {
      "rank": 34,
      "founderCount": 598,
      "companyCount": 533
    },
    "mba": {
      "rank": 44,
      "founderCount": 120,
      "companyCount": 119
    },
    "shortName": "Boston University"
  },
  {
    "id": "univ_bowie_state_university",
    "name": "Bowie State University",
    "country": null,
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Bowie State University"
  },
  {
    "id": "univ_brandeis",
    "name": "Brandeis University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 16,
    "companyCount": 12,
    "candidateProjectCount": 12,
    "resolvedPersonCount": 16,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Brandeis"
  },
  {
    "id": "univ_byu",
    "name": "Brigham Young University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 3,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 3,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 32,
      "founderCount": 585,
      "companyCount": 486
    },
    "grad": null,
    "mba": null,
    "shortName": "BYU"
  },
  {
    "id": "univ_brown",
    "name": "Brown University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 62,
    "companyCount": 33,
    "candidateProjectCount": 33,
    "resolvedPersonCount": 90,
    "sourcesConfigured": 5,
    "lastCheckedAt": "2026-11-02T07:42:03.091Z",
    "undergrad": {
      "rank": 24,
      "founderCount": 703,
      "companyCount": 654
    },
    "grad": null,
    "mba": null,
    "shortName": "Brown"
  },
  {
    "id": "univ_bucknell",
    "name": "Bucknell University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 8,
    "companyCount": 4,
    "candidateProjectCount": 4,
    "resolvedPersonCount": 8,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T07:55:07.279Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Bucknell"
  },
  {
    "id": "univ_caltech",
    "name": "California Institute of Technology",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 30,
    "companyCount": 10,
    "candidateProjectCount": 10,
    "resolvedPersonCount": 32,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T22:00:00.000Z",
    "undergrad": null,
    "grad": {
      "rank": 58,
      "founderCount": 377,
      "companyCount": 310
    },
    "mba": null,
    "shortName": "Caltech"
  },
  {
    "id": "univ_calpoly",
    "name": "California Polytechnic State University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": {
      "rank": 81,
      "founderCount": 300,
      "companyCount": 282
    },
    "grad": null,
    "mba": null,
    "shortName": "Cal Poly"
  },
  {
    "id": "univ_csu",
    "name": "California State University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": {
      "rank": 87,
      "founderCount": 276,
      "companyCount": 269
    },
    "grad": null,
    "mba": null,
    "shortName": "Cal State"
  },
  {
    "id": "univ_canisius",
    "name": "Canisius University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Canisius"
  },
  {
    "id": "univ_cmu",
    "name": "Carnegie Mellon University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 101,
    "companyCount": 64,
    "candidateProjectCount": 64,
    "resolvedPersonCount": 147,
    "sourcesConfigured": 11,
    "lastCheckedAt": "2026-09-27T23:10:00.000Z",
    "undergrad": {
      "rank": 30,
      "founderCount": 594,
      "companyCount": 550
    },
    "grad": {
      "rank": 18,
      "founderCount": 1129,
      "companyCount": 935
    },
    "mba": {
      "rank": 33,
      "founderCount": 165,
      "companyCount": 153
    },
    "shortName": "CMU"
  },
  {
    "id": "univ_case_western",
    "name": "Case Western Reserve University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Case Western"
  },
  {
    "id": "univ_clarkson",
    "name": "Clarkson University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Clarkson"
  },
  {
    "id": "univ_clemson",
    "name": "Clemson University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Clemson"
  },
  {
    "id": "univ_colgate",
    "name": "Colgate University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Colgate"
  },
  {
    "id": "univ_charleston",
    "name": "College of Charleston",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "College of Charleston"
  },
  {
    "id": "univ_columbia",
    "name": "Columbia University",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 162,
    "companyCount": 42,
    "candidateProjectCount": 42,
    "resolvedPersonCount": 198,
    "sourcesConfigured": 18,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 16,
      "founderCount": 829,
      "companyCount": 784
    },
    "grad": {
      "rank": 5,
      "founderCount": 2353,
      "companyCount": 2090
    },
    "mba": {
      "rank": 5,
      "founderCount": 1019,
      "companyCount": 954
    },
    "shortName": "Columbia"
  },
  {
    "id": "univ_conn_college",
    "name": "Connecticut College",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Connecticut"
  },
  {
    "id": "univ_cooper_union",
    "name": "Cooper Union",
    "country": null,
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Cooper Union"
  },
  {
    "id": "univ_cornell_tech",
    "name": "Cornell Tech",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 12,
    "companyCount": 10,
    "candidateProjectCount": 10,
    "resolvedPersonCount": 15,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Cornell Tech"
  },
  {
    "id": "univ_cornell",
    "name": "Cornell University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 84,
    "companyCount": 145,
    "candidateProjectCount": 145,
    "resolvedPersonCount": 107,
    "sourcesConfigured": 7,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 4,
      "founderCount": 1541,
      "companyCount": 1436
    },
    "grad": {
      "rank": 12,
      "founderCount": 1352,
      "companyCount": 1137
    },
    "mba": {
      "rank": 19,
      "founderCount": 282,
      "companyCount": 271
    },
    "shortName": "Cornell"
  },
  {
    "id": "univ_dartmouth",
    "name": "Dartmouth College",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 25,
    "companyCount": 12,
    "candidateProjectCount": 12,
    "resolvedPersonCount": 28,
    "sourcesConfigured": 3,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 34,
      "founderCount": 549,
      "companyCount": 510
    },
    "grad": {
      "rank": 70,
      "founderCount": 323,
      "companyCount": 295
    },
    "mba": {
      "rank": 30,
      "founderCount": 189,
      "companyCount": 184
    },
    "shortName": "Dartmouth"
  },
  {
    "id": "univ_drexel_university",
    "name": "Drexel University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 3,
    "companyCount": 10,
    "candidateProjectCount": 10,
    "resolvedPersonCount": 6,
    "sourcesConfigured": 3,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Drexel"
  },
  {
    "id": "univ_duke",
    "name": "Duke University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 42,
    "companyCount": 47,
    "candidateProjectCount": 47,
    "resolvedPersonCount": 60,
    "sourcesConfigured": 9,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 21,
      "founderCount": 790,
      "companyCount": 755
    },
    "grad": {
      "rank": 30,
      "founderCount": 721,
      "companyCount": 625
    },
    "mba": {
      "rank": 16,
      "founderCount": 334,
      "companyCount": 326
    },
    "shortName": "Duke"
  },
  {
    "id": "univ_ecu",
    "name": "East Carolina University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "East Carolina"
  },
  {
    "id": "univ_emory",
    "name": "Emory University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 17,
    "companyCount": 8,
    "candidateProjectCount": 8,
    "resolvedPersonCount": 17,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 82,
      "founderCount": 297,
      "companyCount": 290
    },
    "grad": null,
    "mba": null,
    "shortName": "Emory"
  },
  {
    "id": "univ_fairfield",
    "name": "Fairfield University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Fairfield"
  },
  {
    "id": "univ_fdu",
    "name": "Fairleigh Dickinson University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Fairleigh Dickinson"
  },
  {
    "id": "univ_florida_international_university",
    "name": "Florida International University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Florida International"
  },
  {
    "id": "univ_fsu",
    "name": "Florida State University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 2,
    "companyCount": 22,
    "candidateProjectCount": 22,
    "resolvedPersonCount": 2,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "FSU"
  },
  {
    "id": "univ_fordham",
    "name": "Fordham University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Fordham"
  },
  {
    "id": "univ_furman",
    "name": "Furman University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Furman"
  },
  {
    "id": "univ_gw",
    "name": "George Washington University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 19,
    "candidateProjectCount": 19,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": {
      "rank": 93,
      "founderCount": 261,
      "companyCount": 252
    },
    "grad": {
      "rank": 63,
      "founderCount": 346,
      "companyCount": 331
    },
    "mba": null,
    "shortName": "GW"
  },
  {
    "id": "univ_georgetown",
    "name": "Georgetown University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 16,
    "companyCount": 10,
    "candidateProjectCount": 10,
    "resolvedPersonCount": 16,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 45,
      "founderCount": 455,
      "companyCount": 443
    },
    "grad": {
      "rank": 47,
      "founderCount": 429,
      "companyCount": 401
    },
    "mba": {
      "rank": 45,
      "founderCount": 117,
      "companyCount": 109
    },
    "shortName": "Georgetown"
  },
  {
    "id": "univ_gatech",
    "name": "Georgia Institute of Technology",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 79,
    "companyCount": 55,
    "candidateProjectCount": 55,
    "resolvedPersonCount": 82,
    "sourcesConfigured": 12,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 33,
      "founderCount": 568,
      "companyCount": 504
    },
    "grad": {
      "rank": 32,
      "founderCount": 683,
      "companyCount": 583
    },
    "mba": null,
    "shortName": "Georgia Tech"
  },
  {
    "id": "univ_harrisburg",
    "name": "Harrisburg University of Science and Technology",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Harrisburg University of Science and Technology"
  },
  {
    "id": "univ_harvard",
    "name": "Harvard University",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 174,
    "companyCount": 171,
    "candidateProjectCount": 171,
    "resolvedPersonCount": 216,
    "sourcesConfigured": 18,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 3,
      "founderCount": 1697,
      "companyCount": 1532
    },
    "grad": {
      "rank": 2,
      "founderCount": 4840,
      "companyCount": 4070
    },
    "mba": {
      "rank": 1,
      "founderCount": 2444,
      "companyCount": 2235
    },
    "shortName": "Harvard"
  },
  {
    "id": "univ_hmc",
    "name": "Harvey Mudd College",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 15,
    "companyCount": 10,
    "candidateProjectCount": 10,
    "resolvedPersonCount": 19,
    "sourcesConfigured": 4,
    "lastCheckedAt": "2026-09-27T23:30:00.000Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Harvey Mudd"
  },
  {
    "id": "univ_high_point_university",
    "name": "High Point University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "High Point"
  },
  {
    "id": "univ_hofstra",
    "name": "Hofstra University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Hofstra"
  },
  {
    "id": "univ_hkust",
    "name": "Hong Kong University of Science and Technology",
    "country": "Hong Kong",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "HKUST"
  },
  {
    "id": "univ_imperial",
    "name": "Imperial College London",
    "country": "United Kingdom",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 9,
    "candidateProjectCount": 9,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 3,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": {
      "rank": 85,
      "founderCount": 284,
      "companyCount": 271
    },
    "grad": {
      "rank": 15,
      "founderCount": 1186,
      "companyCount": 980
    },
    "mba": null,
    "shortName": "Imperial"
  },
  {
    "id": "univ_indiana",
    "name": "Indiana University Bloomington",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 45,
      "founderCount": 455,
      "companyCount": 438
    },
    "grad": {
      "rank": 75,
      "founderCount": 304,
      "companyCount": 278
    },
    "mba": {
      "rank": 46,
      "founderCount": 115,
      "companyCount": 113
    },
    "shortName": "Indiana"
  },
  {
    "id": "univ_iona",
    "name": "Iona University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Iona"
  },
  {
    "id": "univ_ithaca",
    "name": "Ithaca College",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Ithaca"
  },
  {
    "id": "univ_jhu",
    "name": "Johns Hopkins University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": {
      "rank": 54,
      "founderCount": 411,
      "companyCount": 384
    },
    "grad": {
      "rank": 22,
      "founderCount": 902,
      "companyCount": 773
    },
    "mba": null,
    "shortName": "Johns Hopkins"
  },
  {
    "id": "univ_lafayette",
    "name": "Lafayette College",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 2,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T22:00:00.000Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Lafayette"
  },
  {
    "id": "univ_laurentian",
    "name": "Laurentian University",
    "country": "Canada",
    "coverage": "up_to_date",
    "founderCount": 5,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 6,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:30:00.000Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Laurentian"
  },
  {
    "id": "univ_lehigh",
    "name": "Lehigh University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Lehigh"
  },
  {
    "id": "univ_long_island_university",
    "name": "Long Island University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Long Island"
  },
  {
    "id": "univ_loyola_university_chicago",
    "name": "Loyola University Chicago",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Loyola University Chicago"
  },
  {
    "id": "univ_marist",
    "name": "Marist University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Marist"
  },
  {
    "id": "univ_mit",
    "name": "Massachusetts Institute of Technology",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 239,
    "companyCount": 154,
    "candidateProjectCount": 154,
    "resolvedPersonCount": 282,
    "sourcesConfigured": 33,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 5,
      "founderCount": 1525,
      "companyCount": 1342
    },
    "grad": {
      "rank": 3,
      "founderCount": 3833,
      "companyCount": 2943
    },
    "mba": {
      "rank": 7,
      "founderCount": 934,
      "companyCount": 858
    },
    "shortName": "MIT"
  },
  {
    "id": "univ_miami_university",
    "name": "Miami University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Miami"
  },
  {
    "id": "univ_msu",
    "name": "Michigan State University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 2,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 2,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 89,
      "founderCount": 267,
      "companyCount": 257
    },
    "grad": null,
    "mba": null,
    "shortName": "Michigan State"
  },
  {
    "id": "univ_middlebury_college",
    "name": "Middlebury College",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 4,
    "companyCount": 2,
    "candidateProjectCount": 2,
    "resolvedPersonCount": 5,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Middlebury"
  },
  {
    "id": "univ_monmouth_university",
    "name": "Monmouth University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Monmouth"
  },
  {
    "id": "univ_morgan_state",
    "name": "Morgan State University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Morgan State"
  },
  {
    "id": "univ_nus",
    "name": "National University of Singapore",
    "country": "Singapore",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:42:03.091Z",
    "undergrad": {
      "rank": 47,
      "founderCount": 454,
      "companyCount": 383
    },
    "grad": {
      "rank": 51,
      "founderCount": 390,
      "companyCount": 346
    },
    "mba": null,
    "shortName": "NUS"
  },
  {
    "id": "univ_nyit",
    "name": "New York Institute of Technology",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "NYIT"
  },
  {
    "id": "univ_nyu",
    "name": "New York University",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 47,
    "companyCount": 20,
    "candidateProjectCount": 20,
    "resolvedPersonCount": 65,
    "sourcesConfigured": 4,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 19,
      "founderCount": 799,
      "companyCount": 753
    },
    "grad": {
      "rank": 11,
      "founderCount": 1392,
      "companyCount": 1301
    },
    "mba": {
      "rank": 11,
      "founderCount": 546,
      "companyCount": 534
    },
    "shortName": "NYU"
  },
  {
    "id": "univ_north_carolina_a_t_state_university",
    "name": "North Carolina A&T State University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "North Carolina A&T State"
  },
  {
    "id": "univ_north_carolina_central_university",
    "name": "North Carolina Central University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "North Carolina Central"
  },
  {
    "id": "univ_ncsu",
    "name": "North Carolina State University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "NC State"
  },
  {
    "id": "univ_northeastern",
    "name": "Northeastern University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 8,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": {
      "rank": 61,
      "founderCount": 367,
      "companyCount": 345
    },
    "grad": {
      "rank": 81,
      "founderCount": 281,
      "companyCount": 263
    },
    "mba": null,
    "shortName": "Northeastern"
  },
  {
    "id": "univ_northwestern",
    "name": "Northwestern University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 32,
    "companyCount": 57,
    "candidateProjectCount": 57,
    "resolvedPersonCount": 32,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-02T07:13:23.953Z",
    "undergrad": {
      "rank": 24,
      "founderCount": 703,
      "companyCount": 650
    },
    "grad": {
      "rank": 9,
      "founderCount": 1636,
      "companyCount": 1448
    },
    "mba": {
      "rank": 6,
      "founderCount": 1015,
      "companyCount": 966
    },
    "shortName": "Northwestern"
  },
  {
    "id": "univ_osu",
    "name": "Ohio State University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 18,
    "candidateProjectCount": 18,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T07:55:07.279Z",
    "undergrad": {
      "rank": 71,
      "founderCount": 346,
      "companyCount": 324
    },
    "grad": {
      "rank": 72,
      "founderCount": 314,
      "companyCount": 278
    },
    "mba": null,
    "shortName": "Ohio State"
  },
  {
    "id": "univ_olin_college",
    "name": "Olin College",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Olin College"
  },
  {
    "id": "univ_olin_college_of_engineering",
    "name": "Olin College of Engineering",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Olin College of Engineering"
  },
  {
    "id": "univ_pace",
    "name": "Pace University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Pace"
  },
  {
    "id": "univ_penn_state_university",
    "name": "Penn State University",
    "country": null,
    "coverage": "up_to_date",
    "founderCount": 8,
    "companyCount": 6,
    "candidateProjectCount": 6,
    "resolvedPersonCount": 9,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Penn State University"
  },
  {
    "id": "univ_psu",
    "name": "Pennsylvania State University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 34,
      "founderCount": 549,
      "companyCount": 524
    },
    "grad": {
      "rank": 79,
      "founderCount": 292,
      "companyCount": 260
    },
    "mba": null,
    "shortName": "Penn State"
  },
  {
    "id": "univ_pratt_institute",
    "name": "Pratt Institute",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Pratt Institute"
  },
  {
    "id": "univ_princeton",
    "name": "Princeton University",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 106,
    "companyCount": 49,
    "candidateProjectCount": 49,
    "resolvedPersonCount": 130,
    "sourcesConfigured": 10,
    "lastCheckedAt": "2026-11-03T04:53:34.141Z",
    "undergrad": {
      "rank": 14,
      "founderCount": 845,
      "companyCount": 792
    },
    "grad": {
      "rank": 67,
      "founderCount": 337,
      "companyCount": 287
    },
    "mba": null,
    "shortName": "Princeton"
  },
  {
    "id": "univ_purdue",
    "name": "Purdue University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 47,
    "candidateProjectCount": 47,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T12:31:23.262Z",
    "undergrad": {
      "rank": 44,
      "founderCount": 462,
      "companyCount": 433
    },
    "grad": {
      "rank": 52,
      "founderCount": 389,
      "companyCount": 333
    },
    "mba": null,
    "shortName": "Purdue"
  },
  {
    "id": "univ_queens",
    "name": "Queen's University",
    "country": "Canada",
    "coverage": "up_to_date",
    "founderCount": 8,
    "companyCount": 3,
    "candidateProjectCount": 3,
    "resolvedPersonCount": 9,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-09-27T23:30:00.000Z",
    "undergrad": {
      "rank": 78,
      "founderCount": 319,
      "companyCount": 292
    },
    "grad": null,
    "mba": null,
    "shortName": "Queen's"
  },
  {
    "id": "univ_quinnipiac",
    "name": "Quinnipiac University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Quinnipiac"
  },
  {
    "id": "univ_rpi",
    "name": "Rensselaer Polytechnic Institute",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": {
      "rank": 95,
      "founderCount": 257,
      "companyCount": 241
    },
    "grad": null,
    "mba": null,
    "shortName": "RPI"
  },
  {
    "id": "univ_rice",
    "name": "Rice University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 25,
    "companyCount": 10,
    "candidateProjectCount": 10,
    "resolvedPersonCount": 27,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T20:00:00.000Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Rice"
  },
  {
    "id": "univ_rit",
    "name": "Rochester Institute of Technology",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:29:42.524Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "RIT"
  },
  {
    "id": "univ_rose_hulman",
    "name": "Rose-Hulman Institute of Technology",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Rose-Hulman"
  },
  {
    "id": "univ_rutgers",
    "name": "Rutgers University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 9,
    "companyCount": 13,
    "candidateProjectCount": 13,
    "resolvedPersonCount": 9,
    "sourcesConfigured": 3,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": {
      "rank": 86,
      "founderCount": 280,
      "companyCount": 269
    },
    "grad": null,
    "mba": null,
    "shortName": "Rutgers"
  },
  {
    "id": "univ_suny_upstate",
    "name": "SUNY Upstate Medical University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "SUNY Upstate Medical"
  },
  {
    "id": "univ_sacred_heart",
    "name": "Sacred Heart University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 3,
    "companyCount": 3,
    "candidateProjectCount": 3,
    "resolvedPersonCount": 3,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Sacred Heart"
  },
  {
    "id": "univ_santa_clara_university",
    "name": "Santa Clara University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 104,
    "companyCount": 114,
    "candidateProjectCount": 114,
    "resolvedPersonCount": 105,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T07:55:07.279Z",
    "undergrad": null,
    "grad": null,
    "mba": {
      "rank": 42,
      "founderCount": 121,
      "companyCount": 119
    },
    "shortName": "Santa Clara"
  },
  {
    "id": "univ_seton_hall_university",
    "name": "Seton Hall University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Seton Hall"
  },
  {
    "id": "univ_sfu",
    "name": "Simon Fraser University",
    "country": "Canada",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:05:34.378Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "SFU"
  },
  {
    "id": "univ_smu_sg",
    "name": "Singapore Management University",
    "country": "Singapore",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:42:03.091Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "SMU Singapore"
  },
  {
    "id": "univ_smu",
    "name": "Southern Methodist University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:42:03.091Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Southern Methodist"
  },
  {
    "id": "univ_st_johns",
    "name": "St. John's University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "St. John's"
  },
  {
    "id": "univ_stanford",
    "name": "Stanford University",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 314,
    "companyCount": 204,
    "candidateProjectCount": 204,
    "resolvedPersonCount": 757,
    "sourcesConfigured": 33,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 2,
      "founderCount": 1997,
      "companyCount": 1787
    },
    "grad": {
      "rank": 1,
      "founderCount": 5508,
      "companyCount": 4189
    },
    "mba": {
      "rank": 2,
      "founderCount": 1504,
      "companyCount": 1359
    },
    "shortName": "Stanford"
  },
  {
    "id": "univ_suny",
    "name": "State University of New York",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 84,
      "founderCount": 293,
      "companyCount": 290
    },
    "grad": null,
    "mba": null,
    "shortName": "SUNY"
  },
  {
    "id": "univ_stevens",
    "name": "Stevens Institute of Technology",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 14,
    "candidateProjectCount": 14,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 3,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Stevens"
  },
  {
    "id": "univ_swarthmore_college",
    "name": "Swarthmore College",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Swarthmore"
  },
  {
    "id": "univ_syracuse",
    "name": "Syracuse University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 5,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 5,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 96,
      "founderCount": 249,
      "companyCount": 240
    },
    "grad": null,
    "mba": null,
    "shortName": "Syracuse"
  },
  {
    "id": "univ_temple",
    "name": "Temple University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 3,
    "companyCount": 2,
    "candidateProjectCount": 2,
    "resolvedPersonCount": 3,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Temple"
  },
  {
    "id": "univ_tamu",
    "name": "Texas A&M University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 28,
    "candidateProjectCount": 28,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": {
      "rank": 79,
      "founderCount": 317,
      "companyCount": 295
    },
    "grad": {
      "rank": 91,
      "founderCount": 261,
      "companyCount": 242
    },
    "mba": null,
    "shortName": "Texas A&M"
  },
  {
    "id": "univ_tcu",
    "name": "Texas Christian University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 12,
    "companyCount": 8,
    "candidateProjectCount": 8,
    "resolvedPersonCount": 12,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Texas Christian"
  },
  {
    "id": "univ_ttu",
    "name": "Texas Tech University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 4,
    "companyCount": 6,
    "candidateProjectCount": 6,
    "resolvedPersonCount": 4,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Texas Tech"
  },
  {
    "id": "univ_the_college_of_new_jersey",
    "name": "The College of New Jersey",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 3,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 3,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "College of New Jersey"
  },
  {
    "id": "univ_new_school",
    "name": "The New School",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "New School"
  },
  {
    "id": "univ_tufts",
    "name": "Tufts University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 4,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 68,
      "founderCount": 352,
      "companyCount": 340
    },
    "grad": null,
    "mba": null,
    "shortName": "Tufts"
  },
  {
    "id": "univ_arizona",
    "name": "University of Arizona",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": {
      "rank": 80,
      "founderCount": 303,
      "companyCount": 288
    },
    "grad": null,
    "mba": null,
    "shortName": "Arizona"
  },
  {
    "id": "univ_ubc",
    "name": "University of British Columbia",
    "country": "Canada",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 2,
    "candidateProjectCount": 2,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:05:34.378Z",
    "undergrad": {
      "rank": 43,
      "founderCount": 472,
      "companyCount": 415
    },
    "grad": {
      "rank": 54,
      "founderCount": 385,
      "companyCount": 323
    },
    "mba": null,
    "shortName": "UBC"
  },
  {
    "id": "univ_berkeley",
    "name": "University of California, Berkeley",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 247,
    "companyCount": 148,
    "candidateProjectCount": 148,
    "resolvedPersonCount": 655,
    "sourcesConfigured": 36,
    "lastCheckedAt": "2026-11-02T07:13:23.953Z",
    "undergrad": {
      "rank": 1,
      "founderCount": 2380,
      "companyCount": 2155
    },
    "grad": {
      "rank": 4,
      "founderCount": 2468,
      "companyCount": 2035
    },
    "mba": {
      "rank": 9,
      "founderCount": 705,
      "companyCount": 650
    },
    "shortName": "Berkeley"
  },
  {
    "id": "univ_ucdavis",
    "name": "University of California, Davis",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": {
      "rank": 66,
      "founderCount": 356,
      "companyCount": 342
    },
    "grad": {
      "rank": 91,
      "founderCount": 261,
      "companyCount": 234
    },
    "mba": null,
    "shortName": "UC Davis"
  },
  {
    "id": "univ_uci",
    "name": "University of California, Irvine",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 2,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 2,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 89,
      "founderCount": 267,
      "companyCount": 252
    },
    "grad": null,
    "mba": null,
    "shortName": "UC Irvine"
  },
  {
    "id": "univ_ucla",
    "name": "University of California, Los Angeles",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 27,
    "companyCount": 13,
    "candidateProjectCount": 13,
    "resolvedPersonCount": 27,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T22:00:00.000Z",
    "undergrad": {
      "rank": 15,
      "founderCount": 840,
      "companyCount": 807
    },
    "grad": {
      "rank": 14,
      "founderCount": 1272,
      "companyCount": 1108
    },
    "mba": {
      "rank": 12,
      "founderCount": 530,
      "companyCount": 505
    },
    "shortName": "UCLA"
  },
  {
    "id": "univ_ucsd",
    "name": "University of California, San Diego",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 4,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 5,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 38,
      "founderCount": 541,
      "companyCount": 515
    },
    "grad": {
      "rank": 37,
      "founderCount": 532,
      "companyCount": 428
    },
    "mba": null,
    "shortName": "UC San Diego"
  },
  {
    "id": "univ_ucsb",
    "name": "University of California, Santa Barbara",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 9,
    "companyCount": 6,
    "candidateProjectCount": 6,
    "resolvedPersonCount": 9,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T07:55:07.279Z",
    "undergrad": {
      "rank": 58,
      "founderCount": 383,
      "companyCount": 370
    },
    "grad": null,
    "mba": null,
    "shortName": "UCSB"
  },
  {
    "id": "univ_cambridge",
    "name": "University of Cambridge",
    "country": "United Kingdom",
    "coverage": "up_to_date",
    "founderCount": 18,
    "companyCount": 3,
    "candidateProjectCount": 3,
    "resolvedPersonCount": 19,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:30:00.000Z",
    "undergrad": {
      "rank": 55,
      "founderCount": 405,
      "companyCount": 388
    },
    "grad": {
      "rank": 7,
      "founderCount": 1928,
      "companyCount": 1595
    },
    "mba": {
      "rank": 40,
      "founderCount": 127,
      "companyCount": 115
    },
    "shortName": "Cambridge"
  },
  {
    "id": "univ_ucf",
    "name": "University of Central Florida",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "UCF"
  },
  {
    "id": "univ_uchicago",
    "name": "University of Chicago",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 33,
    "companyCount": 9,
    "candidateProjectCount": 9,
    "resolvedPersonCount": 41,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T18:00:00.000Z",
    "undergrad": {
      "rank": 57,
      "founderCount": 401,
      "companyCount": 377
    },
    "grad": {
      "rank": 13,
      "founderCount": 1295,
      "companyCount": 1130
    },
    "mba": {
      "rank": 8,
      "founderCount": 884,
      "companyCount": 823
    },
    "shortName": "UChicago"
  },
  {
    "id": "univ_cincinnati",
    "name": "University of Cincinnati",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Cincinnati"
  },
  {
    "id": "univ_colorado",
    "name": "University of Colorado Boulder",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:29:42.524Z",
    "undergrad": {
      "rank": 40,
      "founderCount": 530,
      "companyCount": 506
    },
    "grad": {
      "rank": 43,
      "founderCount": 438,
      "companyCount": 375
    },
    "mba": null,
    "shortName": "CU Boulder"
  },
  {
    "id": "univ_uconn",
    "name": "University of Connecticut",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:29:42.524Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "UConn"
  },
  {
    "id": "univ_denver",
    "name": "University of Denver",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 4,
    "companyCount": 6,
    "candidateProjectCount": 6,
    "resolvedPersonCount": 4,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Denver"
  },
  {
    "id": "univ_florida",
    "name": "University of Florida",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 51,
      "founderCount": 422,
      "companyCount": 391
    },
    "grad": {
      "rank": 57,
      "founderCount": 378,
      "companyCount": 321
    },
    "mba": null,
    "shortName": "Florida"
  },
  {
    "id": "univ_uga",
    "name": "University of Georgia",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:29:42.524Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "UGA"
  },
  {
    "id": "univ_hawaii",
    "name": "University of Hawaiʻi at Mānoa",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 3,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 3,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T04:53:34.141Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "UH Mānoa"
  },
  {
    "id": "univ_hku",
    "name": "University of Hong Kong",
    "country": "Hong Kong",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "HKU"
  },
  {
    "id": "univ_houston",
    "name": "University of Houston",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 11,
    "candidateProjectCount": 11,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Houston"
  },
  {
    "id": "univ_uiuc",
    "name": "University of Illinois Urbana-Champaign",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 34,
    "companyCount": 18,
    "candidateProjectCount": 18,
    "resolvedPersonCount": 34,
    "sourcesConfigured": 3,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 11,
      "founderCount": 1032,
      "companyCount": 936
    },
    "grad": {
      "rank": 25,
      "founderCount": 872,
      "companyCount": 701
    },
    "mba": null,
    "shortName": "UIUC"
  },
  {
    "id": "univ_umd",
    "name": "University of Maryland, College Park",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 38,
      "founderCount": 541,
      "companyCount": 519
    },
    "grad": {
      "rank": 39,
      "founderCount": 502,
      "companyCount": 434
    },
    "mba": null,
    "shortName": "Maryland"
  },
  {
    "id": "univ_umass",
    "name": "University of Massachusetts Amherst",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": {
      "rank": 70,
      "founderCount": 348,
      "companyCount": 342
    },
    "grad": {
      "rank": 99,
      "founderCount": 246,
      "companyCount": 221
    },
    "mba": null,
    "shortName": "UMass"
  },
  {
    "id": "univ_miami",
    "name": "University of Miami",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 2,
    "companyCount": 10,
    "candidateProjectCount": 10,
    "resolvedPersonCount": 2,
    "sourcesConfigured": 3,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Miami"
  },
  {
    "id": "univ_michigan",
    "name": "University of Michigan",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 45,
    "companyCount": 22,
    "candidateProjectCount": 22,
    "resolvedPersonCount": 64,
    "sourcesConfigured": 7,
    "lastCheckedAt": "2026-11-02T05:51:32.654Z",
    "undergrad": {
      "rank": 8,
      "founderCount": 1085,
      "companyCount": 1012
    },
    "grad": {
      "rank": 19,
      "founderCount": 1082,
      "companyCount": 902
    },
    "mba": {
      "rank": 23,
      "founderCount": 254,
      "companyCount": 246
    },
    "shortName": "Michigan"
  },
  {
    "id": "univ_umn",
    "name": "University of Minnesota",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": {
      "rank": 65,
      "founderCount": 358,
      "companyCount": 334
    },
    "grad": {
      "rank": 46,
      "founderCount": 431,
      "companyCount": 362
    },
    "mba": {
      "rank": 49,
      "founderCount": 107,
      "companyCount": 104
    },
    "shortName": "Minnesota"
  },
  {
    "id": "univ_olemiss",
    "name": "University of Mississippi",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T04:53:34.141Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Ole Miss"
  },
  {
    "id": "univ_nebraska",
    "name": "University of Nebraska–Lincoln",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Nebraska"
  },
  {
    "id": "univ_university_of_new_haven",
    "name": "University of New Haven",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "New Haven"
  },
  {
    "id": "univ_unc",
    "name": "University of North Carolina at Chapel Hill",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 4,
    "sourcesConfigured": 3,
    "lastCheckedAt": "2026-11-02T12:31:23.262Z",
    "undergrad": {
      "rank": 41,
      "founderCount": 502,
      "companyCount": 466
    },
    "grad": {
      "rank": 53,
      "founderCount": 386,
      "companyCount": 352
    },
    "mba": {
      "rank": 36,
      "founderCount": 146,
      "companyCount": 144
    },
    "shortName": "UNC"
  },
  {
    "id": "univ_notredame",
    "name": "University of Notre Dame",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 4,
    "companyCount": 2,
    "candidateProjectCount": 2,
    "resolvedPersonCount": 5,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T20:00:00.000Z",
    "undergrad": {
      "rank": 69,
      "founderCount": 350,
      "companyCount": 324
    },
    "grad": null,
    "mba": null,
    "shortName": "Notre Dame"
  },
  {
    "id": "univ_penn",
    "name": "University of Pennsylvania",
    "country": "United States",
    "coverage": "partial",
    "founderCount": 759,
    "companyCount": 212,
    "candidateProjectCount": 212,
    "resolvedPersonCount": 2082,
    "sourcesConfigured": 127,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 6,
      "founderCount": 1466,
      "companyCount": 1354
    },
    "grad": {
      "rank": 6,
      "founderCount": 2225,
      "companyCount": 1934
    },
    "mba": {
      "rank": 3,
      "founderCount": 1437,
      "companyCount": 1332
    },
    "shortName": "Penn"
  },
  {
    "id": "univ_pitt",
    "name": "University of Pittsburgh",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Pittsburgh"
  },
  {
    "id": "univ_uq",
    "name": "University of Queensland",
    "country": "Australia",
    "coverage": "up_to_date",
    "founderCount": 16,
    "companyCount": 10,
    "candidateProjectCount": 10,
    "resolvedPersonCount": 16,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T04:53:34.141Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "UQ"
  },
  {
    "id": "univ_rochester",
    "name": "University of Rochester",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Rochester"
  },
  {
    "id": "univ_sc",
    "name": "University of South Carolina",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 3,
    "companyCount": 4,
    "candidateProjectCount": 4,
    "resolvedPersonCount": 3,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "South Carolina"
  },
  {
    "id": "univ_usf",
    "name": "University of South Florida",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-02T07:29:42.524Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "USF"
  },
  {
    "id": "univ_usc",
    "name": "University of Southern California",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 48,
    "companyCount": 15,
    "candidateProjectCount": 15,
    "resolvedPersonCount": 49,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T22:00:00.000Z",
    "undergrad": {
      "rank": 20,
      "founderCount": 791,
      "companyCount": 744
    },
    "grad": {
      "rank": 21,
      "founderCount": 1015,
      "companyCount": 890
    },
    "mba": {
      "rank": 22,
      "founderCount": 259,
      "companyCount": 252
    },
    "shortName": "USC"
  },
  {
    "id": "univ_utexas",
    "name": "University of Texas at Austin",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 16,
    "companyCount": 6,
    "candidateProjectCount": 6,
    "resolvedPersonCount": 18,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-09-27T18:00:00.000Z",
    "undergrad": {
      "rank": 10,
      "founderCount": 1036,
      "companyCount": 948
    },
    "grad": {
      "rank": 20,
      "founderCount": 1049,
      "companyCount": 906
    },
    "mba": {
      "rank": 20,
      "founderCount": 273,
      "companyCount": 246
    },
    "shortName": "UT Austin"
  },
  {
    "id": "univ_university_of_texas_at_dallas",
    "name": "University of Texas at Dallas",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 4,
    "companyCount": 4,
    "candidateProjectCount": 4,
    "resolvedPersonCount": 4,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Texas at Dallas"
  },
  {
    "id": "univ_toronto",
    "name": "University of Toronto",
    "country": "Canada",
    "coverage": "up_to_date",
    "founderCount": 15,
    "companyCount": 6,
    "candidateProjectCount": 6,
    "resolvedPersonCount": 16,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 17,
      "founderCount": 808,
      "companyCount": 737
    },
    "grad": {
      "rank": 26,
      "founderCount": 828,
      "companyCount": 655
    },
    "mba": {
      "rank": 39,
      "founderCount": 132,
      "companyCount": 127
    },
    "shortName": "Toronto"
  },
  {
    "id": "univ_uva",
    "name": "University of Virginia",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 13,
    "companyCount": 5,
    "candidateProjectCount": 5,
    "resolvedPersonCount": 15,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T18:00:00.000Z",
    "undergrad": {
      "rank": 28,
      "founderCount": 599,
      "companyCount": 562
    },
    "grad": {
      "rank": 40,
      "founderCount": 477,
      "companyCount": 415
    },
    "mba": {
      "rank": 28,
      "founderCount": 195,
      "companyCount": 187
    },
    "shortName": "UVA"
  },
  {
    "id": "univ_uw",
    "name": "University of Washington",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 13,
    "companyCount": 4,
    "candidateProjectCount": 4,
    "resolvedPersonCount": 16,
    "sourcesConfigured": 3,
    "lastCheckedAt": "2026-09-27T22:00:00.000Z",
    "undergrad": {
      "rank": 31,
      "founderCount": 587,
      "companyCount": 536
    },
    "grad": {
      "rank": 33,
      "founderCount": 616,
      "companyCount": 510
    },
    "mba": {
      "rank": 38,
      "founderCount": 134,
      "companyCount": 126
    },
    "shortName": "UW"
  },
  {
    "id": "univ_waterloo",
    "name": "University of Waterloo",
    "country": "Canada",
    "coverage": "partial",
    "founderCount": 81,
    "companyCount": 45,
    "candidateProjectCount": 45,
    "resolvedPersonCount": 123,
    "sourcesConfigured": 12,
    "lastCheckedAt": "2026-11-02T07:42:03.091Z",
    "undergrad": {
      "rank": 7,
      "founderCount": 1303,
      "companyCount": 1006
    },
    "grad": {
      "rank": 54,
      "founderCount": 385,
      "companyCount": 290
    },
    "mba": null,
    "shortName": "Waterloo"
  },
  {
    "id": "univ_wisc",
    "name": "University of Wisconsin-Madison",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 5,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 5,
    "sourcesConfigured": 2,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 18,
      "founderCount": 802,
      "companyCount": 724
    },
    "grad": {
      "rank": 34,
      "founderCount": 598,
      "companyCount": 490
    },
    "mba": null,
    "shortName": "Wisconsin"
  },
  {
    "id": "univ_vanderbilt",
    "name": "Vanderbilt University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 2,
    "companyCount": 1,
    "candidateProjectCount": 1,
    "resolvedPersonCount": 4,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T20:00:00.000Z",
    "undergrad": {
      "rank": 42,
      "founderCount": 474,
      "companyCount": 460
    },
    "grad": {
      "rank": 77,
      "founderCount": 297,
      "companyCount": 252
    },
    "mba": {
      "rank": 50,
      "founderCount": 104,
      "companyCount": 99
    },
    "shortName": "Vanderbilt"
  },
  {
    "id": "univ_villanova",
    "name": "Villanova University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 10,
    "companyCount": 5,
    "candidateProjectCount": 5,
    "resolvedPersonCount": 10,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Villanova"
  },
  {
    "id": "univ_vcu",
    "name": "Virginia Commonwealth University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "VCU"
  },
  {
    "id": "univ_vt",
    "name": "Virginia Tech",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-09-27T23:40:00.000Z",
    "undergrad": {
      "rank": 88,
      "founderCount": 268,
      "companyCount": 258
    },
    "grad": null,
    "mba": null,
    "shortName": "Virginia Tech"
  },
  {
    "id": "univ_wake_forest",
    "name": "Wake Forest University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 0,
    "companyCount": 6,
    "candidateProjectCount": 6,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Wake Forest"
  },
  {
    "id": "univ_washu",
    "name": "Washington University in St. Louis",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 14,
    "companyCount": 12,
    "candidateProjectCount": 12,
    "resolvedPersonCount": 14,
    "sourcesConfigured": 1,
    "lastCheckedAt": "2026-11-03T09:01:00.057Z",
    "undergrad": {
      "rank": 63,
      "founderCount": 365,
      "companyCount": 337
    },
    "grad": {
      "rank": 61,
      "founderCount": 352,
      "companyCount": 293
    },
    "mba": null,
    "shortName": "WashU"
  },
  {
    "id": "univ_wesleyan_university",
    "name": "Wesleyan University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Wesleyan"
  },
  {
    "id": "univ_west_chester_university",
    "name": "West Chester University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "West Chester"
  },
  {
    "id": "univ_western_university",
    "name": "Western University",
    "country": null,
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 2,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Western University"
  },
  {
    "id": "univ_western_university_huron_college",
    "name": "Western University (Huron College)",
    "country": "Canada",
    "coverage": "not_scanned",
    "founderCount": 1,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 1,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Western University (Huron College)"
  },
  {
    "id": "univ_wpi",
    "name": "Worcester Polytechnic Institute",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "WPI"
  },
  {
    "id": "univ_yale",
    "name": "Yale University",
    "country": "United States",
    "coverage": "up_to_date",
    "founderCount": 73,
    "companyCount": 40,
    "candidateProjectCount": 40,
    "resolvedPersonCount": 93,
    "sourcesConfigured": 4,
    "lastCheckedAt": "2026-11-03T09:19:10.624Z",
    "undergrad": {
      "rank": 13,
      "founderCount": 887,
      "companyCount": 825
    },
    "grad": {
      "rank": 24,
      "founderCount": 876,
      "companyCount": 743
    },
    "mba": {
      "rank": 26,
      "founderCount": 225,
      "companyCount": 212
    },
    "shortName": "Yale"
  },
  {
    "id": "univ_yeshiva",
    "name": "Yeshiva University",
    "country": "United States",
    "coverage": "not_scanned",
    "founderCount": 0,
    "companyCount": 0,
    "candidateProjectCount": 0,
    "resolvedPersonCount": 0,
    "sourcesConfigured": 0,
    "lastCheckedAt": null,
    "undergrad": null,
    "grad": null,
    "mba": null,
    "shortName": "Yeshiva"
  }
];
