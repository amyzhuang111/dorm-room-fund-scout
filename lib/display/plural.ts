/** English count + noun with simple singular/plural. */
export function countNoun(n: number, singular: string, pluralForm?: string): string {
  const noun = n === 1 ? singular : (pluralForm ?? `${singular}s`);
  return `${n.toLocaleString("en-US")} ${noun}`;
}

export function nounFor(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`);
}
