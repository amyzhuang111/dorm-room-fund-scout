# /networks preview merge (source: dc6d7fd)

The Networks page from `cursor/scoring-r50-network` commit `dc6d7fd4583ef9f83789b363c657a0708e5fb422` is integrated on a new branch based on current `main`, retaining the canonical database and all student founder/startup imports through PRs 107, 109, 110 and 111.

## Scope
- Restore the exact preview's Networks app, graph, 3D visualization, timeline, encodings, and source model.
- Add `/networks` route, responsive desktop and mobile navigation entries.
- Add the required `three` runtime and TypeScript dependencies from the preview's committed package files.
- Build current-network graph, page, poster and deal files from **latest** `data/campus-universe.db` during `prebuild`; generated files are not copied from the old preview and are gitignored.
- Apply page-specific cream surface without changing the white background of unrelated pages.
- Preserve the existing company and founder desks, map, source catalogue, and database.

## Provenance / scope boundaries
This is a code-only port of the explicitly identified older preview; the branch being scored by Taste+Design is left untouched. The URL `https://campus-scout-7woqrzlus-amys-projects-d3dfb125.vercel.app/networks` is an immutable historical deployment. A merge of this code will make a new Vercel deployment URL; it does **not** alter that historical URL.

## Validation
`.github/workflows/verify-network-preview-merge.yml` checks that the poster, graph and network data recompute from the current database, runs directory tests, and completes a Next.js build including `/networks`. The live Vercel deployment also builds `precompute:networks` through the package `prebuild` script. No binary database overwrite or automatic record merge occurs.

Source code: [dc6d7fd](https://github.com/amyzhuang111/dorm-room-fund-scout/commit/dc6d7fd4583ef9f83789b363c657a0708e5fb422).
