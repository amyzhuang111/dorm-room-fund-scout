import type { DirectoryData } from "@/lib/domain/directory";

type DirectoryWindow = Window & { __directoryPromise?: Promise<DirectoryData> };

let pending: Promise<DirectoryData> | null = null;

/** Full directory written at build time. Shared with the globe boot script. */
export function loadDirectoryClient(): Promise<DirectoryData> {
  if (typeof window === "undefined") return Promise.reject(new Error("directory is loaded in the browser"));
  const existing = (window as DirectoryWindow).__directoryPromise;
  // The early page boot script owns the first request. Adopt it into the same
  // retry lifecycle rather than caching its rejection for the whole session.
  if (existing && existing !== pending) {
    const adopted = existing.catch((error: unknown) => {
      if (pending === adopted) pending = null;
      if ((window as DirectoryWindow).__directoryPromise === adopted) delete (window as DirectoryWindow).__directoryPromise;
      throw error;
    });
    pending = adopted;
    (window as DirectoryWindow).__directoryPromise = adopted;
  }
  if (!pending) {
    const request = fetch("/data/sample-directory.json").then(async (res) => {
      if (!res.ok) throw new Error("directory");
      return (await res.json()) as DirectoryData;
    });
    pending = request.catch((error: unknown) => {
      pending = null;
      delete (window as DirectoryWindow).__directoryPromise;
      throw error;
    });
    (window as DirectoryWindow).__directoryPromise = pending;
  }
  return pending;
}
