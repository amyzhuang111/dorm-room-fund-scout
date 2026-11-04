// Copy MapLibre's prebuilt ESM into public/vendor. The globe imports this URL
// at runtime. Bundling the package replaces its blob: tile worker, so the
// files have to stay the package's own build. The entry module imports
// maplibre-gl-shared.mjs, and the worker is loaded from a relative URL.
import fs from "node:fs";
import path from "node:path";

const dist = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist");
const files = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"];
const destDir = path.join(process.cwd(), "public", "vendor");
fs.mkdirSync(destDir, { recursive: true });
for (const name of files) {
  const src = path.join(dist, name);
  if (!fs.existsSync(src)) {
    console.error(`maplibre-gl dist is missing ${name}. Run npm install.`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(destDir, name));
}
const bytes = files.reduce((sum, name) => sum + fs.statSync(path.join(destDir, name)).size, 0);
console.log(`maplibre ${(bytes / 1024).toFixed(0)} KiB → public/vendor (${files.join(", ")})`);
