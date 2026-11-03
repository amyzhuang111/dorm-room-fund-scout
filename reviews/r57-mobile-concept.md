# r57 mobile — investor-first open lane

Base: `9301fd1` (r56). Branch: `cursor/scoring-r57`.

## Bold mobile change
1. **Open-lane primary feed** — peek chips and deck cards prefer founders with a strong signal and no top fund (open lane). Campus segments use open-lane campus ranks. Label: "Open lane · N · no top fund yet".
2. **Compact expandable map header** — peek keeps REST=120 (≥80% unobstructed). On deck/expanded, `data-fold-sheet-mode` shrinks the map stage to ~24vh (140–220px) so the founder feed owns the screen.
3. **Evidence chips** — each founder card shows strong signal types + programs. Company ledger rows add stage + program chips on mobile.
4. **Companies-more polish** — continued mast leads with companies range figure (`N–M of total`); end plate leads with loaded count; last-3 strip shows signal chips.

## Desktop
Unchanged (MapStageOverlays / open-lane hero from r56). Compact map only when `!wide`.

## Gates kept
- Unobstructed ≥80% @375 (peek REST=120)
- All check-*.mjs, real data, shared 1,173 total
