# Network map refinement — November 3, 2026

This is an incremental UX update on top of the entire existing GitHub main branch, including the global startup HQ map and canonical startup/founder SQLite corpus. It **does not overwrite the map, records, directories, founder desk or original r50 visualization geometry**.

## Screenshot-matched camera stops

1. **Wide** — 0.76 relative scale: whole graph and major island groups (first far-out screenshot)
2. **Overview** — 1.14 relative scale: broad view with strongest campus summaries (second far-out screenshot)
3. **Campuses** — 1.88 relative scale: colored campus clusters and fund/program hubs (mid screenshot)
4. **Connections** — 2.77 relative scale: individual ties and founder/company cards (close-mid screenshot)
5. **Founders** — 4.24 relative scale: deep tracking boxes and individual relationships (closest screenshot)

Each level is an actual camera scale, not a visual label. The 3D path uses OrbitControls and staged overlays; the 2D fallback supports the same presets. Manual scroll/wheel updates the highlighted preset without forcibly snapping the camera. Reset restores a consistent wide orientation. Close-up interaction stops idle orbit so names remain readable.

## Data and mobile

- Re-evaluate program/fund connections from the **latest GitHub SQLite database** at build time, not historical r50 snapshot JSON. Original confirmed-founder and investable-company requirements remain.
- Add exact 2026 official roster source rules for Stanford Ventures/Cardinal, HBS Rock, Harvard Alumni Entrepreneurs, Brown B-Lab, Georgia Tech CREATE-X, UC Davis, Duke, NYU, Harvard PIC, Rice, CMU VentureBridge, UChicago and MIT $100K. A university program with only unconfirmed team participants gains **no invented founder edges**.
- All 81+ evidenced networks are searchable and filterable by accelerator, program, investor and lab instead of truncating visible choices to the top 24. Original matrix remains top-12 for legibility.
- Mobile starts in light 2D for responsive performance, with available 3D opt-in. Both show the same five camera stops. Founder membership details are reachable from the mobile network list.

## Validation

GitHub Actions runs `.github/workflows/refine-networks-explorer.yml`: camera-stop unit tests, verified HBS/Stanford edges, regenerated 3D scene JSON, existing directory tests and TypeScript. Vercel performs the actual Next production build. Do not merge on failed tests, and preserve the current `main` database.
