# Unified Campus Scout workspace

The homepage keeps the globe, company database, founders, campus rankings, investor/program networks, data coverage, and Ask Scout in one workspace. Existing full-page directories and record URLs remain available.

## Behavior

- URL state includes panel, query, campus, sector, HQ region, operating status, network, missing field, sort, and selected company/founder. Browser back/forward and shared links restore those values.
- Campus matching uses every stored founder affiliation and explicit company-campus relationship, not only the previously selected primary campus. One company can count at several campuses. Rankings explain this overlap.
- Company profiles show full stored founder names, verification state, campuses, industry, HQ, founded year, team size, operating status, and evidence links. Missing information is labeled, not inferred. An initial-only name is flagged for verification.
- CSV export covers the entire filtered result, including results beyond the visible page. Company/founder exports include stored source URLs. CSV cells use the existing formula-injection protection and UTF-8 BOM.
- Networks rank recorded investor/program affiliations. The database does not support a credible former-employer mafia ranking or social-influence ranking; neither is invented.
- The Insights panel shows field coverage and lets a scout open records missing a particular field.
- Feedback prepares a public GitHub issue for the visitor to review and submit. It does not silently send feedback or claim delivery.
- Donate opens a free-app support dialog. Its payment link appears only when `NEXT_PUBLIC_SCOUT_SUPPORT_URL` points to the owner's HTTPS Buy Me a Coffee or Ko-fi profile. No payment destination is assumed.
- When WebGL or map tiles fail, an orthographic SVG globe plots the recorded campus coordinates and supports campus selection and east/west rotation. This is labeled as a simplified globe.

## Validation

Use a copy of the database, following AGENTS.md. All application data changes remain in the existing ingestion pipeline; this change does not replace the committed binary database.

```
CAMPUS_UNIVERSE_DB_PATH=/tmp/campus-scout-workspace.db node --import tsx lib/domain/directory.test.ts
CAMPUS_UNIVERSE_DB_PATH=/tmp/campus-scout-workspace.db node --import tsx lib/domain/startup-card.test.ts
node --import tsx lib/domain/scout-workspace.test.ts
node --import tsx lib/display/csv.test.ts
npx tsc --noEmit
```

Browser checks covered desktop and a 375 × 812 embedded viewport, campus ranking drill-down, a sourced company detail card, combined campus/HQ filters, CSV download, and copying the current view. Penn + New York produced 21 companies; the downloaded CSV had 21 rows, all with New York HQ and Penn among their campus links. The browser does not provide WebGL2, so the SVG fallback was verified; the underlying WebGL renderer was not visually verified here.

The rebuilt catalog contains 2,572 companies. All campus links are retained for 207 companies with more than one recorded campus. These figures describe the tested snapshot and may change with future ingestion.
