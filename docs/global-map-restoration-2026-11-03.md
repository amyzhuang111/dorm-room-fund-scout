# Global Startup HQ map restoration — November 3, 2026

The map issue reported in the user's screenshot occurred because the global startup location work was left on branch `codex/r59-globe-locations` while the production home page continued using the campus-only `TileGlobe`.

This change ports the reviewed location layer and original source JSON files from commit `3483141ff2dfa81cd90c7b3fd021abfdb48d386e` onto the newest `main`, **without replacing** `data/campus-universe.db` or touching the `/networks` and `/founders` pages.

The global map now has a visible two-way toggle:
- **Startup HQs:** city-level headquarters supported by existing company facts, with city counts, optional explicitly verified office-address markers when zoomed in, search and company filtering. Missing HQs stay unmapped rather than acquiring a fabricated university point.
- **Campuses:** original global university dots, counts and selection.
  
The city dataset references official gazetteer entries; the office source JSON only includes independently reviewed business location evidence, and the referenced review documents explain which lookalike startup names or mailing addresses were excluded. No private/home address should be inferred.

The original 2026 campus founder and accelerator imports (PRs 107, 109, 110, 111), founder desk and r50 network (PR 112) remain in the canonical DB/UI. The new `/api/company-locations` endpoint reads the **latest** underlying DB at request time; it does not copy companies from the older r59 branch.

Verification: `.github/workflows/verify-global-hq-map.yml` runs data integrity and building-map tests, regression tests and a full TypeScript check. Vercel performs the actual production build separately. A commit-specific Vercel preview URL is immutable; verify the newly deployed URL rather than the previous 2026-11-03 snapshot.
