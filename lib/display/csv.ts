import { formatCorpusDate } from "@/lib/display/corpus-date";
import { plainText } from "@/lib/display/plain-text";

const PLACEHOLDER = /^(?:n\/a|na|none|null|undefined|not available|-+)$/i;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/** One plain cell: no HTML, no odd spaces, no dash punctuation, no placeholder tokens. */
export function cleanCsvText(value: unknown): string {
  if (value == null) return "";
  let text = decodeEntities(String(value));
  text = text.replace(/<\s*br\s*\/?\s*>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ");
  text = text.replace(/[\r\n\t\f\v]+/g, " ");
  text = text.replace(/ {2,}/g, " ").trim();
  text = plainText(text) ?? "";
  text = text.replace(/\s+/g, " ").trim();
  if (!text || PLACEHOLDER.test(text)) return "";
  return text;
}

/** Person names as they should read in a spreadsheet, without handles, class-year suffixes, or leading junk. */
export function cleanCsvName(value: unknown): string {
  let text = cleanCsvText(value);
  text = text.replace(/\s*\(GitHub\)\s*$/i, "");
  text = text.replace(/^@+/, "");
  text = text.replace(/^\.+(?=[A-Za-z])/, "");
  text = text.replace(/^\d+\s+(?=[A-Za-z])/, "");
  text = text.replace(/\s*\([^)]*(?:['’]\d{2}|\b(?:19|20)\d{2}\b)[^)]*\)\s*$/, "");
  text = text.replace(/\s+['’]\d{2}\s*$/, "");
  return text.trim();
}

export function cleanCsvNames(values: unknown[]): string {
  return values.map((value) => cleanCsvName(value)).filter(Boolean).join(" | ");
}

/** Stored dates only. A missing day or month stays blank instead of -00. */
export function cleanCsvDate(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = cleanCsvText(value);
  if (!text) return "";
  return formatCorpusDate(text) ?? "";
}

export function cleanCsvUrl(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) return "";
    const host = url.hostname.toLowerCase();
    if (host === "html.duckduckgo.com" || host.endsWith(".duckduckgo.com") || host === "duckduckgo.com") return "";
    if ((host === "google.com" || host.endsWith(".google.com") || host === "bing.com" || host.endsWith(".bing.com")) && url.pathname.startsWith("/search")) return "";
    return text;
  } catch {
    return "";
  }
}

export function cleanCsvList(values: unknown[], separator = " | "): string {
  return values.map((value) => cleanCsvText(value)).filter(Boolean).join(separator);
}

export function cleanCsvUrls(values: unknown[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const url = cleanCsvUrl(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out.join(" | ");
}

function encodeCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const raw = typeof value === "number" ? String(value) : value;
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/** UTF-8 CSV with a BOM so Excel keeps names and punctuation intact. */
export function encodeCsv(rows: (string | number | null | undefined)[][]): string {
  const lines = rows.map((row) => row.map(encodeCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
