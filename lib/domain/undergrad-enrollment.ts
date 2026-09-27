// Undergraduate headcount for founders-per-1,000. The network map sizes campus
// nodes from graph degree, not from enrollment, so this is a separate cited
// table. U.S. figures are College Scorecard `latest.student.size` (IPEDS
// undergraduate degree-seeking enrollment), retrieved 2026-09-27. MIT's 4,535
// and Stanford's 7,554 match the Fall 2024 IPEDS institution profiles
// (degree-seeking undergraduates). Schools outside that file use the
// headcount named on each row.

export interface UndergradEnrollment {
  universityId: string;
  /** Headcount used as the denominator. Never estimated. */
  undergrads: number;
  year: string;
  /** What the number counts, in the source's own terms. */
  kind: string;
  sourceName: string;
  sourceUrl: string;
}

const SCORECARD = "U.S. Department of Education College Scorecard, latest.student.size";

function scorecard(universityId: string, unitId: number, undergrads: number): UndergradEnrollment {
  return {
    universityId,
    undergrads,
    year: "Fall 2024 IPEDS",
    kind: "degree-seeking undergraduates",
    sourceName: SCORECARD,
    sourceUrl: `https://collegescorecard.ed.gov/school/?${unitId}`,
  };
}

export const UNDERGRAD_ENROLLMENT: readonly UndergradEnrollment[] = [
  scorecard("univ_berkeley", 110635, 33068),
  scorecard("univ_brown", 217156, 7226),
  scorecard("univ_bu", 164988, 18248),
  scorecard("univ_caltech", 110404, 987),
  scorecard("univ_cmu", 211440, 7304),
  scorecard("univ_columbia", 190150, 8973),
  scorecard("univ_cornell", 190415, 15995),
  scorecard("univ_dartmouth", 182670, 4541),
  scorecard("univ_duke", 198419, 6442),
  scorecard("univ_emory", 139658, 7298),
  scorecard("univ_gatech", 139755, 18785),
  scorecard("univ_georgetown", 131496, 7569),
  scorecard("univ_harvard", 166027, 7601),
  scorecard("univ_hmc", 115409, 921),
  scorecard("univ_lafayette", 213385, 2757),
  scorecard("univ_michigan", 170976, 34177),
  scorecard("univ_mit", 166683, 4535),
  scorecard("univ_northwestern", 147767, 9201),
  scorecard("univ_notredame", 152080, 8818),
  scorecard("univ_nyu", 193900, 28663),
  scorecard("univ_penn", 215062, 10650),
  scorecard("univ_princeton", 186131, 5709),
  scorecard("univ_rice", 227757, 4776),
  scorecard("univ_stanford", 243744, 7554),
  scorecard("univ_uchicago", 144050, 7569),
  scorecard("univ_ucla", 110662, 33475),
  scorecard("univ_uiuc", 145637, 36258),
  scorecard("univ_unc", 199120, 20752),
  scorecard("univ_usc", 123961, 20443),
  scorecard("univ_utexas", 228778, 42855),
  scorecard("univ_uva", 234076, 17597),
  scorecard("univ_uw", 236948, 31942),
  scorecard("univ_vanderbilt", 221999, 7208),
  scorecard("univ_washu", 179867, 7857),
  scorecard("univ_yale", 130794, 6758),
  scorecard("univ_wisc", 240444, 36902),
  scorecard("univ_byu", 230038, 32952),
  scorecard("univ_psu", 214777, 42284),
  scorecard("univ_umd", 163286, 30760),
  scorecard("univ_ucsd", 110680, 34948),
  scorecard("univ_colorado", 126614, 31939),
  scorecard("univ_purdue", 243780, 44503),
  scorecard("univ_indiana", 151351, 37806),
  scorecard("univ_florida", 134130, 35629),
  scorecard("univ_jhu", 162928, 5693),
  scorecard("univ_ucsb", 110705, 23113),
  scorecard("univ_asu", 104151, 64674),
  scorecard("univ_northeastern", 167358, 17326),
  scorecard("univ_umn", 174066, 31855),
  scorecard("univ_ucdavis", 110644, 32253),
  scorecard("univ_tufts", 168148, 7061),
  scorecard("univ_umass", 166629, 23671),
  scorecard("univ_osu", 204796, 45638),
  scorecard("univ_bc", 164924, 10085),
  scorecard("univ_tamu", 228723, 59615),
  scorecard("univ_arizona", 104179, 42537),
  scorecard("univ_calpoly", 110422, 21996),
  scorecard("univ_rutgers", 186380, 37751),
  scorecard("univ_vt", 233921, 30923),
  scorecard("univ_msu", 171100, 40922),
  scorecard("univ_uci", 110653, 30197),
  scorecard("univ_gw", 131469, 11182),
  scorecard("univ_rpi", 194824, 5714),
  scorecard("univ_syracuse", 196413, 15477),
  {
    universityId: "univ_waterloo",
    undergrads: 34061,
    year: "Fall 2025",
    kind: "bachelor's undergraduates",
    sourceName: "University of Waterloo Institutional Analysis & Planning, student headcounts (ud_headcount-spring-2026.xlsx), Fall of fiscal 2025/26, career UG, program level Bachelors",
    sourceUrl: "https://uwaterloo.ca/institutional-analysis-planning/sites/default/files/uploads/documents/ud_headcount-spring-2026.xlsx",
  },
  {
    universityId: "univ_toronto",
    undergrads: 81412,
    year: "Fall 2025",
    kind: "undergraduates",
    sourceName: "University of Toronto quick facts, student enrolment Fall 2025-26",
    sourceUrl: "https://www.utoronto.ca/about-u-of-t/quick-facts",
  },
  {
    universityId: "univ_queens",
    undergrads: 23551,
    year: "1 Nov 2024",
    kind: "undergraduates",
    sourceName: "Queen's University Enrolment Report 2024-25, undergraduate subtotal as of 1 November 2024",
    sourceUrl: "https://www.queensu.ca/registrar/sites/uregwww/files/uploaded_files/pdfs/Reports/Enrolment%20Reports/Reduced%20Size/Enrolment-Report-2024-25.pdf",
  },
];

const BY_ID = new Map(UNDERGRAD_ENROLLMENT.map((row) => [row.universityId, row]));

export function undergradEnrollment(universityId: string): UndergradEnrollment | null {
  return BY_ID.get(universityId) ?? null;
}
