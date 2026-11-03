/** Typography for company-page display only. Stored evidence and URLs stay intact. */
export function companyDisplayCopy<T>(value: T): T {
  if (typeof value === "string") {
    return (/^(?:https?:\/\/|\/)/i.test(value) ? value : value.replace(/[\u2013\u2014]/g, "-")) as T;
  }
  if (Array.isArray(value)) return value.map(item => companyDisplayCopy(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, companyDisplayCopy(item)])) as T;
  }
  return value;
}
