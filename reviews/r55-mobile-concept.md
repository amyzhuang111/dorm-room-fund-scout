# r55 — company product chrome + white shell

**Blind on r54 (8691f84):** mobile company record lost 6/6 (bare card / cream shell / no product nav; rater called it a third-party clone).

## Fix

- Opaque white sticky site chrome (`header[data-site-chrome]`, `[data-site-nav]`).
- Company shell `data-company-shell="white"` + mobile product strip (`Companies` / Scout dossier / Map).
- Mobile company shots at **scrollY=0** so Campus Scout nav + desk tabs stay in frame (65b4329).
- New gate: `scripts/check-company-chrome.mjs` fails if mobile company lacks site nav in viewport or uses a non-white shell.

## Kept from r54

- Peek REST 120 · campus segments · expand-to-deck · home-map unobstructed ≥80% @375.
- Dossier content (founders / CONFIRMED / peers).

## Cheap polish

- Richer peek chips (founder + company).
- Shoot framing for companies more/filters/signals keeps chrome.
