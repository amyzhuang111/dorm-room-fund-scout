# Deep verification of unverified startups

Second pass, 2026-09-27. Starts from the 442 companies left unverified by the first audit.
A company is **confirmed** when its own live site titles itself with that name.
It is **partly verified** when a public page (news, accelerator profile, LinkedIn company page, YC, or Product Hunt) identifies it and no own site could be confirmed.
Course projects with no continuation are taken off the startup list (`is_investable_candidate = 0`). People whose only company was that project are marked potential founders.
Namesakes, directories, and pages about a different organization were left unverified.

## Why the 442 were unverified

Counts are one row, one original source: the earliest project claim.

### By original source

- Penn Venture Lab VIP-X: 78
- Berkeley SkyDeck: 70
- Penn Venture Lab Startup Challenge / Bridge: 42
- Penn Health-Tech: 34
- PCI Ventures: 31
- Penn Startup Showcase (Pennovation): 21
- Campus founder hotspots: 19
- Harvard President's Innovation Challenge: 18
- CMU Project Olympus / CMU News: 17
- Startup Columbia: 14
- MIT delta v: 13
- a16z speedrun: 13
- Velocity (Waterloo): 10
- President's Innovation Prize: 9
- Penn Engineering EAS 5490 (Devpost): 8
- Y-Prize: 5
- GRASP Lab: 5
- Daily Pennsylvanian / Penn press: 5
- M&T: 4
- Princeton Keller eLab: 4
- StartX: 4
- Stanford STVP: 3
- MIT $100K: 3
- Georgia Tech CREATE-X: 2
- Teragen Energy article: 2
- Y Combinator directory: 2
- WUEC: 1
- Wharton / other Penn press: 1
- Cardinal Ventures: 1
- Kleiner Perkins Fellows: 1
- YesPress: 1
- Penn Labs alumni search: 1

Source families sum to 442.

### By campus

Source campus is the school the importing list is about. SkyDeck rows often have no founder attached, so they show up as Berkeley here and as no-affiliation below.

- Penn: 244
- Berkeley: 73
- Harvard: 21
- Multi-campus: 21
- CMU: 17
- MIT: 16
- Columbia: 14
- Waterloo: 10
- Stanford: 8
- Illinois: 7
- Princeton: 4
- Unassigned: 3
- Georgia Tech: 2
- Northwestern: 2

Founder affiliation (a company can count in more than one school):

- No founder campus on the row: 231
- University of Pennsylvania: 146
- Harvard University: 21
- Columbia University: 15
- Stanford University: 9
- University of Waterloo: 8
- Massachusetts Institute of Technology: 6
- University of California, Berkeley: 5
- Georgia Institute of Technology: 3
- Carnegie Mellon University: 3
- Princeton University: 1
- University of Michigan: 1

### Why the first pass failed them

- No company website on record, only the program or source page: 286
- Stored website did not load or did not name the company: 135
- Stored domain was a different company, a redirect, or spam: 20
- Only a LinkedIn company URL, and it was a login wall: 1

Among the 135 stored websites, the fetch broke down as DNS failure 44, TLS or certificate error 28, HTTP 404 24, HTTP 403 16, timeout 6, HTTP 429 3, another HTTP error 6, and 8 pages that loaded but did not name the company. The 20 domain mismatches are separate: those URLs had already been cleared because they pointed at a different product or at spam.

## What changed

- Confirmed: 48
- Partly verified: 148
- Removed from the startup list / reclassified: 8
- Still unverified: 238

### Confirmed

- **Adalat AI** — Live site matches Adalat AI. Website: https://www.adalat.ai/about-us
- **AdaptaPlay** — Live site matches AdaptaPlay. Website: https://adaptaplay.org/
- **Airalux Medical** — Live site matches Airalux Medical. Website: https://www.airalux.com/
- **Anthum AI** — Live site matches Anthum AI. Website: https://anthum.ai/
- **Asakana** — Live site matches Asakana. Website: https://www.asakana.co/
- **Asearis** — asearis.com describes next-generation cloud computing, matching the decentralised-compute description from the Anderson Draper Showcase. Website: https://asearis.com/

### Partly verified

- **02AI** — LinkedIn company page identifies 02AI. No confirmed company website.
- **A microfluidic device to optimize CAR T cell generation** — News page identifies A microfluidic device to optimize CAR T cell generation. No confirmed company website.
- **AIR-AD device to help COPD patients breathe easier** — News page identifies AIR-AD device to help COPD patients breathe easier. No confirmed company website.
- **AMP-Vent** — News page identifies AMP-Vent. No confirmed company website.
- **Accountstory** — SkyDeck company page identifies Accountstory. No confirmed company website.
- **Adaptive Reader** — News page identifies Adaptive Reader. No confirmed company website.

### Removed or reclassified

- **Bikeability** — Penn Engineering EAS 5490 Spring 2026 course project on Devpost. No independent company site or continuation was found, so it is off the startup list.
- **Dossier** — Penn Engineering EAS 5490 Spring 2026 course project on Devpost. No independent company site or continuation was found, so it is off the startup list.
- **Felivo** — Penn Engineering EAS 5490 Spring 2026 course project on Devpost. No independent company site or continuation was found, so it is off the startup list.
- **Handled** — Penn Engineering EAS 5490 Spring 2026 course project on Devpost. itshandled.ai is a different CPG company, so no website was stored. Removed from the startup list.
- **Little Autonomy** — Penn Engineering EAS 5490 Spring 2026 course project on Devpost. No independent company site or continuation was found, so it is off the startup list.
- **Skip Networking** — Penn Engineering EAS 5490 Spring 2026 course project on Devpost. No independent company site or continuation was found, so it is off the startup list.
- **Spector** — Penn Engineering EAS 5490 Spring 2026 course project on Devpost. No independent company site or continuation was found, so it is off the startup list.
- **Straightline** — Penn Engineering EAS 5490 Spring 2026 course project on Devpost. No independent company site or continuation was found, so it is off the startup list.

### Still unverified, with a checked namesake

- **Verra** — verra.org is the climate-standards nonprofit, not the a16z speedrun company.
- **Kyma** — kyma-project.io is the CNCF project, not the delta v company at kyma.health.
- **Vado** — vado.com is a bathroom-fittings manufacturer, not the Venture Lab team.
- **Navi** — navi.gg is the Natus Vincere esports club, not the Columbia startup.
- **Swarm** — swarm.aero is a defense-autonomy company; the hotspot row is a bug-repellent venture.
- **Galileo** — galileo.ai is an AI-evaluation company and was not tied to the PCI spinout of the same name.
- **Tiffin** — tiffin.com is a Philadelphia restaurant. This VIP-X row is chef software, so the restaurant domain was not stored.

Nothing was filled in by guessing a domain. Reddit was not used as a source.

