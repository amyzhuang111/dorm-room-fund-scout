# r37 redesign proposal — home/map hero + mobile list

**Base:** `da246e1`  
**Branch:** `cursor/scoring-r37-redesign`  
**Problem:** Absolute scores stuck ~80–81 for nine rounds. Patches (hit-test, Ask strip, dock, rails) held parity but did not move originality or hero/list craft. Taste asks for a **bolder redesign** of the home/map hero and the mobile list — not another micro-fix pass.

**Rules (both directions):** true white · no YCGlobe · no dark surfaces · **cobalt only** (retire ember/amber accents on these surfaces) · real data · every element earns its place · Monitor *patterns* (situation at a glance, instrument density, ranked desks), not Monitor *looks*.

**Shared assets to lean on:** typographic `CampusSeal` (cobalt ink, double-rule frame) — the one mark we already own that is not a globe and not a logo tile.

---

## Direction A — Seal Dispatch (recommended)

### Typography scale
| Role | Size / weight | Notes |
|------|---------------|-------|
| Peak figure | 80–88px mono bold, tracking −0.08em | Cobalt (was ember). One number owns the fold. |
| Peak denominator | 36–40px mono | Ink (`--fg`), not muted gray competing with the peak. |
| Statement | 17–18px semibold, tight | “Apr 2026 took **48%** of every dated signal…” — percent in cobalt. |
| Kicker | 10px mono uppercase, 0.28em | `PEAK SHARE` / `DESK RANK` in cobalt. |
| Campus rank name | 16px semibold | Seal + name + founders count (mono 18 bold cobalt). |
| Mobile peak | 40px mono bold cobalt | Same story, compressed; no second ember system. |
| Founder name (mobile card) | 18px semibold | Seal is the left rail; name is the only loud text. |
| Meta / why | 12–13px | Why line in cobalt hairline, not ember bar. |

### Density
- Desk hero: **one** instrument row — peak statement | desk rank (top 3) — then map+founders. Cut the competing “fine print” and repeated quiet counts from the hero band.
- Mobile: peak → search → founders list. Filters stay one compact row; cards lose the double border + award stack feel.
- Whitespace is structural (rule lines, seal gutters), not empty chrome.

### Original visual identity (cobalt seals)
- **Desk rank** becomes a seal column: each top campus shows a large seal (`lg`/`md`) + short label + founders. Seals are the brand beat, not orange chronograph bars.
- Peak bars stay, but peak fill is **cobalt solid**; non-peak is cobalt 25% — no ember.
- Map legend and selection ring already cobalt; keep them the only accent language on the stage.

### Hero composition
```
[ PEAK SHARE ]                    [ DESK RANK ]
  32 / 67                           ① [PN] Penn …… 758
  Apr took 48% of dated…            ② [ST] Stanford … 300
  ▆▆█▆▆  (cobalt bars)              ③ [BK] Berkeley … 245
────────────────────────────────────────────────────────
MAP (white stage, cobalt frame)  |  FOUNDERS (filtered)
```
- Peak numeral is the “situation” Monitor beat; desk rank is the campus wire.
- No cream globe, no orange chronograph, no dual hero numbers.

### Mobile list card
```
┌─────────────────────────────────────────┐
│ [PN]  Conor Brown                       │
│       Penn · Keye                       │
│       Fintech · 2024 · Founder          │
│       Y Combinator · Penn Venture Lab   │
│       ┃ Why: Y Combinator · Keye        │  ← cobalt hairline
└─────────────────────────────────────────┘
```
- Seal `md`/`lg` as the left identity; drop left gray border-l chrome.
- One meta line + optional programs; why-worth only when it adds a fact (keep assignWhyWorthALook).
- “Show more” = cobalt outline/fill, not ember pill.

### Why this is stronger
Originality has been the soft floor (~7.0–7.7). Seals-as-system is already in the codebase and unused as a hero language. Cobalt-only peak kills the amber/ember notes raters keep flagging. Clear type moment (80px peak) without Monitor cosplay.

---

## Direction B — Instrument Mast

### Typography scale
| Role | Size / weight | Notes |
|------|---------------|-------|
| Mast figures | 28–32px mono bold cobalt | Three equal instruments in one strip: peak · top desk · campuses on map. |
| Mast labels | 9px mono uppercase | Dense, equal weight — no 72px display. |
| Map title | 12px semibold cobalt | “Map” becomes a desk plate, not a section shout. |
| Founder name | 16px semibold | Slightly quieter than A; density over drama. |
| Meta | 11px mono | Ticket fields. |

### Density
- Hero collapses to a **single horizontal mast** (peak | #1 campus founders | campuses on map | dated/quiet). Peak bars move under the map or disappear if they don’t change a decision.
- More of the fold is map+list; less essay above the fold.
- Mobile cards become **ticket rows**: seal monogram rail (fixed 28px), name, one meta line, why as footnote.

### Original visual identity (cobalt seals)
- Mast uses mini seals only next to the #1 campus figure.
- List left rail is a continuous seal column (aligned), reading as a dispatch ledger.
- Cobalt hairlines between mast cells; no colored fills except the active campus plate.

### Hero composition
```
│ 32 peak Apr │ [PN] 758 Penn │ 74 campuses │ 67 dated · 1005 quiet │
────────────────────────────────────────────────────────────────────
MAP (dominant)                         FOUNDERS
```
- Situation-at-a-glance (Monitor pattern) without Monitor chrome.
- Risk: can feel like another dashboard strip if seals don’t carry identity.

### Mobile list card
```
│PN│ Conor Brown · Keye
│  │ Penn · Fintech · 2024
│  │ Why: Y Combinator · Keye
```
- Ultra-dense; seal column shared alignment across the page.
- Stronger for “operator” energy; weaker as a memorable type moment.

### Why this is the runner-up
Fixes busy-fold complaints and raises scan speed, but originality lift is smaller — still a strip of numbers. Without a display peak, raters who want a hero figure stay cold.

---

## Build choice

**Ship Direction A — Seal Dispatch.**  
Larger originality surface (seal system + cobalt peak type), still Monitor in *behavior* (ranked desks, peak share of dated signals, map+filtered founders). Direction B’s mast can be a follow-up compression pass if A’s hero still reads tall on 375.

### Non-negotiables while building
- Keep all check anchors: `data-fold-peak-*`, `data-sample-strip-counts`, `data-founder-card`, map `__campusScoutMap`, Ask strip, overlay clicks, count consistency.
- Functional parity: real-touch map 10/10, Cmd-K Stanford clean, facets, CSV, ≤210 KiB/page.
- No dark surfaces, no cream globe, **no ember** on redesigned surfaces.
