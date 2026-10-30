import { GLOBE_BOOT_SCRIPT, MAPLIBRE_URL, NETWORK_BOOT_SCRIPT } from "@/lib/client/map-boot-script";

// Homepage globe. Warm DNS/TLS for tiles; MapLibre itself mounts after first paint
// (see tile-globe idle callback) so FCP is not blocked on the CDN chunk.
export function GlobeBoot() {
  return (
    <>
      <link rel="preconnect" href="https://unpkg.com" crossOrigin="" />
      <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="" />
      <link rel="preload" as="fetch" href="https://tiles.openfreemap.org/styles/positron" crossOrigin="anonymous" />
      <link rel="preload" as="fetch" href="/data/globe-map.json" />
      <link rel="preload" as="fetch" href="/data/sample-directory.json" />
      {/* Prefetch MapLibre without putting it on the critical path (no modulepreload). */}
      <link rel="prefetch" href={MAPLIBRE_URL} as="script" crossOrigin="" />
      <script type="module" dangerouslySetInnerHTML={{ __html: GLOBE_BOOT_SCRIPT }} />
    </>
  );
}

// Startup Discover already has campus rows in the page, so it only needs the
// map library and tile host warmed up.
export function GlobeLibraryBoot() {
  return (
    <>
      <link rel="preconnect" href="https://unpkg.com" crossOrigin="" />
      <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="" />
      <link rel="modulepreload" href={MAPLIBRE_URL} crossOrigin="" />
      <link rel="preload" as="fetch" href="https://tiles.openfreemap.org/styles/positron" crossOrigin="anonymous" />
      <script type="module" dangerouslySetInnerHTML={{ __html: `if (!window.__maplibrePromise) window.__maplibrePromise = import(${JSON.stringify(MAPLIBRE_URL)});` }} />
    </>
  );
}

export function NetworkBoot() {
  return (
    <>
      <link rel="preload" as="fetch" href="/data/network-map.json" />
      <script type="module" dangerouslySetInnerHTML={{ __html: NETWORK_BOOT_SCRIPT }} />
    </>
  );
}
