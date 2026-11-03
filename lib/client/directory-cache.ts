import type { DirectoryData } from "@/lib/domain/directory";

type DirectoryWindow = Window & { __directoryPromise?: Promise<DirectoryData> };

let pending: Promise<DirectoryData> | null = null;

/** Full directory written at build time. Shared with the globe boot script. */
export function loadDirectoryClient(): Promise<DirectoryData> {
  if (typeof window === "undefined") return Promise.reject(new Error("directory is loaded in the browser"));
  const existing = (window as DirectoryWindow).__directoryPromise;
  if (existing) return existing;
  if (!pending) {
    pending = fetch("/data/sample-directory.json").then(async (res) => {
      if (!res.ok) throw new Error("directory");
      return (await res.json()) as DirectoryData;
    });
    (window as DirectoryWindow).__directoryPromise = pending;
  }
  return pending;
}
