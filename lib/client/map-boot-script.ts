export const MAPLIBRE_URL = "https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.mjs";

// Runs from the first HTML byte, before React hydrates. The map chunk awaits
// the same promises, so the globe library and campus dots are already in flight.
export const GLOBE_BOOT_SCRIPT = `
  const w = window;
  if (!w.__maplibrePromise) w.__maplibrePromise = import(${JSON.stringify(MAPLIBRE_URL)});
  if (!w.__globeMapPromise) {
    w.__globeMapPromise = fetch("/data/globe-map.json").then(async (res) => {
      if (res.ok) return res.json();
      const fallback = await fetch("/api/globe?part=map");
      if (!fallback.ok) throw new Error("globe map failed");
      return fallback.json();
    });
  }
  if (!w.__directoryPromise) {
    w.__directoryPromise = fetch("/data/sample-directory.json").then(async (res) => {
      if (!res.ok) throw new Error("directory");
      return res.json();
    });
  }
`;

export const NETWORK_BOOT_SCRIPT = `
  const w = window;
  if (!w.__networkMapPromise) {
    w.__networkMapPromise = fetch("/data/network-map.json").then(async (res) => {
      if (res.ok) return res.json();
      const fallback = await fetch("/api/network/map");
      if (!fallback.ok) throw new Error("network map failed");
      return fallback.json();
    });
  }
`;
