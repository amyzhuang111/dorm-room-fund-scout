import fs from "node:fs";
import path from "node:path";

export type LogoBlocklist = {
  version: number;
  sha256: string[];
  pixel32: string[];
};

let cache: { sha: Set<string>; pix: Set<string> } | null = null;

function loadSets(): { sha: Set<string>; pix: Set<string> } {
  if (cache) return cache;
  const file = path.join(process.cwd(), "public", "company-logos", "blocklist.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LogoBlocklist;
    cache = {
      sha: new Set(raw.sha256 ?? []),
      pix: new Set(raw.pixel32 ?? []),
    };
  } catch {
    cache = { sha: new Set(), pix: new Set() };
  }
  return cache;
}

export function isBlockedLogoHash(sha256Hex: string | null | undefined, pixel32Hex?: string | null): boolean {
  const sets = loadSets();
  if (sha256Hex && sets.sha.has(sha256Hex)) return true;
  if (pixel32Hex && sets.pix.has(pixel32Hex)) return true;
  return false;
}

/** Portal / CMS hosts whose favicon is never a company mark. */
export const BLOCKED_LOGO_HOST =
  /(?:^|\.)(ycombinator\.com|linkedin\.com|wix\.com|wixsite\.com|squarespace\.com|wordpress\.com|wp\.com)$/i;

export const BLOCKED_LOGO_SOURCE =
  /ycombinator\.com|linkedin\.com\/favicon|wix\.com\/favicon|static\.wixstatic|editmysite\.com|placeholder|wp-content\/uploads\/wix|wordpress\.com\/favicon/i;
