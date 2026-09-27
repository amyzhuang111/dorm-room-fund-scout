/**
 * Undergraduate headcount used as the campus size denominator.
 *
 * US campuses: U.S. Department of Education College Scorecard field
 * `latest.student.size` (IPEDS undergraduate enrollment), retrieved 2026-09-27
 * via https://api.data.gov/ed/collegescorecard/v1/schools.json
 *
 * Others, because they are outside IPEDS:
 * - Waterloo: 34,204 undergraduates (2022). University of Waterloo student
 *   headcounts, https://uwaterloo.ca/institutional-analysis-planning/university-data-and-statistics/student-data/student-headcounts
 * - Toronto: 81,412 undergraduates, Fall 2025-26. https://www.utoronto.ca/about-u-of-t/quick-facts
 * - Queen's: 26,052 undergraduates (2022). Office of Planning and Budgeting enrolment,
 *   https://www.queensu.ca/planningandbudget/irp/institutional-data/student/enrolment
 * - Laurentian: 8,100 students, fall 2023, undergraduate and graduate combined
 *   (the published figure). https://www.cbc.ca/news/canada/sudbury/enrolment-laurentian-unviersity-insolvency-recovery-1.7030850
 * - Cambridge: 13,345 undergraduates, HESA 2024/25.
 * - Cornell Tech has no undergraduate college. The denominator is the campus's
 *   published master's body, about 600. https://tech.cornell.edu/about/
 */
const UNDERGRAD_ENROLLMENT: Record<string, number> = {
  univ_penn: 10650,
  univ_berkeley: 33068,
  univ_mit: 4535,
  univ_stanford: 7554,
  univ_waterloo: 34204,
  univ_harvard: 7601,
  univ_columbia: 8973,
  univ_gatech: 18785,
  univ_michigan: 34177,
  univ_princeton: 5709,
  univ_cmu: 7304,
  univ_brown: 7226,
  univ_cornell: 15995,
  univ_cornell_tech: 600,
  univ_duke: 6442,
  univ_hmc: 921,
  univ_nyu: 28663,
  univ_yale: 6758,
  univ_bu: 18248,
  univ_caltech: 987,
  univ_cambridge: 13345,
  univ_dartmouth: 4541,
  univ_emory: 7298,
  univ_georgetown: 7569,
  univ_lafayette: 2757,
  univ_laurentian: 8100,
  univ_northwestern: 9201,
  univ_notredame: 8818,
  univ_queens: 26052,
  univ_rice: 4776,
  univ_toronto: 81412,
  univ_ucla: 33475,
  univ_uchicago: 7569,
  univ_uiuc: 36258,
  univ_unc: 20752,
  univ_usc: 20443,
  univ_utexas: 42855,
  univ_uva: 17597,
  univ_uw: 31942,
  univ_vanderbilt: 7208,
  univ_washu: 7857,
};

/** Used only when a campus id is missing from the table, so the ratio stays finite. */
const FALLBACK_ENROLLMENT = 8000;

export function undergradEnrollment(campusId: string): number {
  return UNDERGRAD_ENROLLMENT[campusId] ?? FALLBACK_ENROLLMENT;
}
