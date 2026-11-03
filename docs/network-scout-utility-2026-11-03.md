# Action-first Network Scout usability update (November 3, 2026)

This changes **only** the network exploration workflow and data presentation. The global map, verified headquarters/office mapping, startup directory, founder records, other application pages and the canonical SQLite database stay intact.

## What users can now do

1. **Find an actual person or startup**, not just program titles, using the top search. The search also accepts campus, stage, accelerator or fund names; type filters narrow it to investors, accelerators, labs or programs.
2. **Select a network directly on the graph** and immediately see a useful inspector without scrolling below the huge graphic. The inspector shows real founder/company identities, counts, and a jump to the full linked roster.
3. **Take an action on each relationship:** open a founder in Founder Scout (correct search-enabled URL), open the company record, preview the company in place, or open the public evidence URL stored for that specific relationship.
4. **Share findings:** copy a deep link to the chosen network. Opening that URL restores the selected network and opens its inspector.
5. **Find all members:** remove the former silent 80-member network roster cutoff. The full build-time network data still only includes established founder status and independently sourced ties; hackathon participants are not promoted automatically.
6. **See only useful context by default:** long concentration charts and methodology are available on demand; the inaccessible duplicate investor table is removed. Investors remain reachable through the investor filter.

## Evidence and limitations

The network definition is an observed public claim, program membership, or investor fact linked to a named **confirmed founder** of an investable company. **Absence** of a program tie from Campus Scout is not evidence that a founder has no relationship. Source buttons appear only when a public HTTP(S) evidence URL is stored. Search examines all loaded founder-company links for each of the networks in the latest canonical database, rather than only the old top-80 member sample.

## Validation

`.github/workflows/network-scout-utility.yml` runs pure search tests, full-roster and actual HBS Rock source tests, navigation/action checks, updated JSON graph precompute, existing directory tests, and TypeScript. Vercel builds the same current database version on merge. This PR is code-only, with no replacement of `data/campus-universe.db`.
