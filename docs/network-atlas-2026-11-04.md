# Full network atlas

The `/networks` map now uses a dense, gently rotating field of colored tiles, following the supplied Embedding Projector reference. Every tile is a stored founder or company. The geometry remains stable while geography filters recolor and highlight it.

- Locations: continent → country → campus, with separate campus-affiliation and company-headquarters views. Multiple campus affiliations are retained; counts are distinct records within each group and may overlap across groups.
- Full corpus: all company records and all classified founders or people with an explicit founder role. No top-network or per-network sampling cap.
- Connections: documented founder/company roles and shared accelerator, program, investor, lab, and explicit club/team memberships. A shared membership does not assert a personal relationship.
- Selection: pointer/touch selection, nearby-tile disambiguation, searchable paginated record list, source links, public profile links, and navigation between founders and their startups. Unverified profile candidates are explicitly labeled.
- Navigation: bounded panning, pointer-centered wheel zoom, pinch zoom, Fit all, pauseable orbit, reduced-motion support, and a mobile Explore toggle. Selecting or dragging pauses motion.

## Location recovery

The initial join missed explicit project→university relationships. Including those relationships restored thousands of campus locations. Eleven missing campus country fields are supplied by a small evidence file linking official campus pages. The SQLite database is unchanged.

At validation on the current database: 9,117 records (3,127 founders and 5,990 companies), 104 networks, and 159 represented campuses. All represented campuses have a country. 185 records have neither campus nor company-HQ evidence. These records remain visible, searchable, and clickable; the interface does not invent geography. Campus-only coverage has a different missing count because headquarters are not campus affiliations.

## Validation

- Atlas coverage, stable layout, valid edge endpoints, URL protocol, and campus-country tests.
- Directory and startup-card tests, TypeScript, and lint.
- Production webpack build.
- Browser checks at 1280px, 768px, and 375px: continent/country/campus drilldown, founder search, founder/company card navigation, direct tile tap, responsive controls, and no page-level horizontal overflow.

Integrated on top of main `70e22dd`, including concurrent accessibility and existing-test fixes. Global map, imported SQLite, and the Taste+Design branch are not edited.
