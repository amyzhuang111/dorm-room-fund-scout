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
  cited("univ_tau", 15285, "2019", "undergraduates", "Tel Aviv University English Wikipedia infobox, undergraduates field (2019), retrieved 2026-11-04", "https://en.wikipedia.org/wiki/Tel_Aviv_University"),
  cited("univ_technion", 9251, "2014", "undergraduates", "Council for Higher Education in Israel annual report Table 8 (2014), cited by the English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/Technion_%E2%80%93_Israel_Institute_of_Technology"),
  cited("univ_iit_bombay", 6276, "2023–2024", "undergraduates", "IIT Bombay Pocket Statistics 2023-24", "https://www.iitb.ac.in/sites/www.iitb.ac.in/files/2025-01/Pocket%20Statistics%202023_24.pdf"),
  cited("univ_mcgill", 27737, "2024", "undergraduates", "McGill University Enrolments Report 2024", "https://www.mcgill.ca/es/registration-statistics"),
  cited("univ_tsinghua", 16272, "English Wikipedia infobox, retrieved 2026-11-04", "undergraduates", "Tsinghua University facts page, cited by the English Wikipedia infobox undergraduates field", "https://en.wikipedia.org/wiki/Tsinghua_University"),
  cited("univ_iit_delhi", 4971, "NIRF 2024", "undergraduates", "NIRF 2024 undergraduates, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/IIT_Delhi"),
  cited("univ_western", 30647, "2023–2024", "undergraduates", "Western University Facts & Figures, 2023–2024", "https://www.uwo.ca/about/whoweare/facts.html"),
  cited("univ_iit_madras", 4909, "NIRF 2024", "undergraduates", "NIRF 2024 undergraduates, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/IIT_Madras"),
  cited("univ_iit_kharagpur", 8452, "2025", "undergraduates", "IIT Kharagpur NIRF 2026 overall submission", "https://www.iitkgp.ac.in/assets/pdf/nirf26_overall.pdf"),
  cited("univ_iit_kanpur", 4410, "NIRF 2024", "undergraduates", "NIRF 2024 undergraduates, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/IIT_Kanpur"),
  cited("univ_oxford", 12460, "2025", "undergraduates", "University of Oxford student numbers (2025), English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/University_of_Oxford"),
  cited("univ_cambridge", 13345, "2024/25", "undergraduates", "HESA student statistics 2024/25 undergraduate population, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/University_of_Cambridge"),
  cited("univ_peking", 16746, "English Wikipedia infobox, retrieved 2026-11-04", "undergraduates", "Peking University statistical report, cited by the English Wikipedia infobox undergraduates field", "https://en.wikipedia.org/wiki/Peking_University"),
  cited("univ_delhi", 114494, "NIRF 2024", "undergraduates", "NIRF 2024 undergraduates, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/Delhi_University"),
  cited("univ_sydney", 40388, "2024", "undergraduates", "University of Sydney Annual Report 2024, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/University_of_Sydney"),
  cited("univ_monash", 56996, "2023", "undergraduates", "Monash University at a glance 2023, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/Monash_University"),
  cited("univ_snu", 15870, "2022", "undergraduates", "Seoul National University 2022 enrollment, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/Seoul_National_University"),
  cited("univ_tcd", 14085, "2023/24", "undergraduates", "Higher Education Authority Key Facts and Figures, cited by the English Wikipedia infobox, retrieved 2026-11-04", "https://hea.ie/statistics/data-for-download-and-visualisations/key-facts-figures/"),
  cited("univ_lse", 5785, "2024/25", "undergraduates", "HESA student statistics 2024/25 undergraduate population, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/London_School_of_Economics"),
  cited("univ_suny", 339800, "Fall 2025", "undergraduates", "SUNY Fast Facts, fall 2025 undergraduates, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/State_University_of_New_York"),
  cited("univ_imperial", 12080, "2024/25", "undergraduates", "HESA student statistics 2024/25 undergraduate population, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/Imperial_College_London"),
  cited("univ_csu", 408248, "2023–24", "undergraduates", "CSU Facts 2025, p. 13, English Wikipedia infobox, retrieved 2026-11-04", "https://en.wikipedia.org/wiki/California_State_University"),
  cited("univ_bits", 11917, "NIRF 2025", "undergraduates", "NIRF 2025 overall submission for BITS Pilani", "https://www.nirfindia.org/nirfpdfcdn/2025/pdf/Overall/IR-O-U-0391.pdf"),
  cited("univ_zhejiang", 28960, "2024", "undergraduates", "Zhejiang University Statistical Bulletin 2024", "https://www.zju.edu.cn/tjgb/list.htm"),
];

function cited(
  universityId: string,
  undergrads: number,
  year: string,
  kind: string,
  sourceName: string,
  sourceUrl: string,
): UndergradEnrollment {
  return { universityId, undergrads, year, kind, sourceName, sourceUrl };
}

const BY_ID = new Map(UNDERGRAD_ENROLLMENT.map((row) => [row.universityId, row]));

export function undergradEnrollment(universityId: string): UndergradEnrollment | null {
  return BY_ID.get(universityId) ?? null;
}
