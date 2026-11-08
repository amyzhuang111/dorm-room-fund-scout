/** Browser fetch of the company directory used by the record context rail. */
import type { FacetCompany } from "@/lib/domain/sample-facets";

export const SAMPLE_DIRECTORY_FILE = "/data/sample-directory.json";
export const SAMPLE_DIRECTORY_API = "/api/sample-directory";

let sharedDirectory: Promise<FacetCompany[]> | null = null;

export function clearSampleDirectoryCache(): void {
  sharedDirectory = null;
}

async function readCards(url: string): Promise<FacetCompany[]> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`directory ${res.status} ${url}`);
  const data = (await res.json()) as { cards?: FacetCompany[] };
  if (!Array.isArray(data.cards)) throw new Error(`directory cards missing ${url}`);
  return data.cards;
}

/**
 * The static file is written by the map precompute. When that file is absent,
 * the same card list is read from the app. A failed static response is not
 * treated as success; the API request still has to return cards.
 */
export function fetchSampleDirectory(url = SAMPLE_DIRECTORY_FILE): Promise<FacetCompany[]> {
  if (!sharedDirectory) {
    const primary = readCards(url);
    sharedDirectory = (
      url === SAMPLE_DIRECTORY_API
        ? primary
        : primary.catch(() => readCards(SAMPLE_DIRECTORY_API))
    ).catch((err) => {
      sharedDirectory = null;
      throw err;
    });
  }
  return sharedDirectory;
}
