# Reviewed company-name collision: Agora

Reviewed November 2, 2026. These two stored records represent different companies. Neither their data nor the company count was changed.

| Record | Product | Founders | Source |
| --- | --- | --- | --- |
| `proj_jRCyQwIq8J1u` | Software for professional clothing resellers | Christian Herren, David Cui, Tomer Ben Yaakov | [NYU's 2026 Summer Launchpad cohort](https://entrepreneur.nyu.edu/blog/2026/06/03/meet-the-2026-nyu-summer-launchpad-cohort/), June 3, 2026 |
| `proj_yTsIek7JT4YO` | Campus marketplace for students buying and selling goods | Meha Gaba, Yochi Hobson | [The Daily Pennsylvanian's report](https://www.thedp.com/article/2024/11/penn-startup-apps-trading-items), November 19, 2024 |

The deduplication audit records this reviewed collision only when both exact IDs, primary source URLs, normalized name and complete founder-name sets match. A third record, changed source or changed founder set invalidates the exception. Domain, exact-signal and corpus-count checks remain unchanged. This avoids merging unrelated companies just because their names normalize to the same string.
