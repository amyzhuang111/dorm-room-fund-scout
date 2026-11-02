import fs from "node:fs";
import path from "node:path";

type Manifest = {
  logos?: Record<string, { path?: string }>;
};

let cache: Map<string, string> | null = null;

function load(): Map<string, string> {
  if (cache) return cache;
  const map = new Map<string, string>();
  try {
    const manifestPath = path.join(process.cwd(), "public", "company-logos", "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      cache = map;
      return map;
    }
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
    const logos = raw.logos ?? {};
    for (const [id, entry] of Object.entries(logos)) {
      if (!entry?.path) continue;
      const file = path.join(process.cwd(), "public", entry.path.replace(/^\//, ""));
      if (!fs.existsSync(file)) continue;
      map.set(id, entry.path.startsWith("/") ? entry.path : `/${entry.path}`);
    }
  } catch {
    /* no logos */
  }
  cache = map;
  return map;
}

/** Local cached logo path under /company-logos, or null when none was verified. */
export function localCompanyLogoUrl(companyId: string | null | undefined): string | null {
  if (!companyId) return null;
  return load().get(companyId) ?? null;
}

export function localLogoCoverage(): { withLogo: number; totalCached: number } {
  const m = load();
  return { withLogo: m.size, totalCached: m.size };
}
