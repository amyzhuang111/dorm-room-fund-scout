# r56 — desk open-lane fold

**Blind on r55 (4bf29fb):** won 58% overall vs r54 but fold-1440 and fold-filters-1440 only 1/3. Avg flat at 80.46.

## Desktop first-screen diff (8691f84 → 4bf29fb)

Product delta was mobile/company chrome only (white shell, site nav, peek chips). Desk fold pixels drifted ~6% (map tiles). No desk layout regression to undo beyond stacking mast above the map that still ate first-screen height.

## Bold desk change (keep every mobile gain)

1. **Full-bleed map** — desk stage ~86vh (640–900px); hierarchy padding cleared on lg.
2. **Open-lane investor hero** — left fold panel answers “which strong student founders have no top fund yet” with real count **131** (strong signal, no top VC / YC / peers) plus campus counts (Penn 20, Northwestern 13, …) against the shared **1,173** companies.
3. **Filters in the fold** — search, filter chips, and current-view strip move into a top overlay mast on the map (no stacked mast above the stage).
4. **Peak kept** — compact month bars under open-lane so density/chrono gates still see peak figure + bars; open-lane owns campus ranks.

## Mobile

Unchanged: REST=120 peek, white company shell, site nav, deck sheet, unobstructed ≥80%.
