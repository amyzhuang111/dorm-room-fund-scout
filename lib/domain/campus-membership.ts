/** A company counts once at each documented campus, regardless of its display campus. */
export function companyCampusIds(company: { schoolId?: string | null; campusIds?: readonly string[] }): string[] {
  return [...new Set([...(company.campusIds ?? []), ...(company.schoolId ? [company.schoolId] : [])])];
}

export function companyMatchesCampus(company: { schoolId?: string | null; campusIds?: readonly string[] }, campus: string): boolean {
  const ids = companyCampusIds(company);
  return campus === 'missing' || campus === 'not_on_record' ? ids.length === 0 : ids.includes(campus);
}
