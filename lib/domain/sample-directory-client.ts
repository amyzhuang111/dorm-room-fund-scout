/** Browser fetch of the precomputed sample directory. Shared so home + company shell share one in-flight request. */
import type { FacetCompany } from "@/lib/domain/sample-facets";

let sharedDirectory: Promise<FacetCompany[]> | null = null;

export function fetchSampleDirectory(url = "/data/sample-directory.json"): Promise<FacetCompany[]> {
  if (!sharedDirectory) {
    sharedDirectory = fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`directory ${res.status}`);
        const data = (await res.json()) as { cards?: FacetCompany[] };
        return Array.isArray(data.cards) ? data.cards : [];
      })
      .catch((err) => {
        sharedDirectory = null;
        throw err;
      });
  }
  return sharedDirectory;
}
