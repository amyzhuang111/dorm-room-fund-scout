# Accuracy audit

Checked 2026-09-27 against company websites, YC company pages, press, GitHub, Devpost, and university pages.
Search HTML came from DuckDuckGo, Bing, and Google. LinkedIn profile pages were not fetched (they require a login). DRF alumni rows were not modified.

## Counts

- Founders checked: 2098
- Startups checked: 1997
- Facts checked (company facts, claims, program relationships, pre-college signals): 18723
- Dead evidence links flagged: 117
- Evidence links replaced: 5
- Pages that loaded but did not name the entity: 781
- Fetches blocked (403, 429, or a login wall other than LinkedIn): 523

## Fixes by field

- verification_status: 756
- founded_year: 413
- team_size: 410
- hq: 406
- description: 134
- operating_status: 6
- website: 2

## False positives removed from scout lists

- Removed: 2

- **Philipp Hadjimina.** Cited YC page for Univerbal does not list Philipp Hadjimina.
- **Blank New Venture Collaboration.** Blank New Venture Collaboration appears only as part of an award title, not as a person.

## Duplicates

- Merged: 7
- Known pairs kept separate: 22

- **Aegis.** Different products. Aegis: Navigating cities is dangerous. We fix that. | Aegis: AI agents that fight denied insurance claims; YC S25; CMU founders
- **Aura.** Different products. Aura: Listed on Berkeley SkyDeck's public companies directory. SkyDeck does not publish founder names on this page, and the program is not limited | Aura: fashionista who? you will be ;)
- **Caravan.** Different products. Caravan: Effortless carpooling | Caravan: A GPU-bound network of compute sourced from general consumers and university research labs to make executing ML workloads cheaper, faster, a
- **Orbit.** Different products. Orbit: From “I should” to “I did.”Our workflow listens, understands, and drives real progress from every conversation. | Orbit: Orbit builds non-invasive neurostimulators that utilize the brain’s exis
- **Reacher.** Different products. Reacher: The Social Media to help Education! | Reacher: We automate creator marketing for the world's largest brands
- **agora / Agora/PennGPT.** Different products. agora: Campus-specific student marketplace app consolidating listings without shipping fees. | Agora/PennGPT: Agora/PennGPT: AI-powered assistant for UPenn community. Get instant answers about academi
- **Blitz / Blitz Indian Eats.** Different products. Blitz: Too broke to afford VR headsets and joysticks? We got you covered. Enjoy immersive FPS games using a handheld pistol! | Blitz Indian Eats LLC: hot, high-quality, filling, affordable indian meal
- **Dispatch / Dispatch Therapeutics.** Different products. Dispatch: Dispatch: An AI copilot for 911 operators that transcribes calls in real time, prioritizes emergencies, suggests dispatcher scripts, and rou | Dispatch Therapeutics: Penn-licensed startup li
- **FirstResponder-Relay / Relay.** Different products. FirstResponder-Relay: When 911 lines flood during a wildfire, FirstResponder Relay triages overflow calls in 13+ languages, locates callers inside active fire zon | Relay: Postman AI Agent Automation 
- **Haven / HAVEN (Y-Prize).** Different products. Haven: Hospital command center powered by context-aware agentic AI that alerts nurses, unifies EHR data, and answers patient questions, improving u | HAVEN (Y-Prize): A customizable concrete wave-ener
- **Haven / Helper Haven.** Different products. Haven: Hospital command center powered by context-aware agentic AI that alerts nurses, unifies EHR data, and answers patient questions, improving u | Helper Haven: Connecting organizations to voluntee
- **PennApps / PennApps Music App.** Different products. PennApps: abc | PennApps Music App: An idea for a novel music app intended to help address centralization in the music industry by directly connecting listeners and artists.
- **Scout / Scout.ly.** Different products. Scout: AI insights for consumer products | Scout.ly: Athletic recruiting powered by social data
- **Vital Start / Vital Start Health.** Different products. Vital Start:  Vital Start Penn Startup Showcase 2025 Recap | Pennovation Works Penn Startup Showcase 2025 Recap | Pennovation Works Skip to main content  | Vital Start Health: Penn-licensed startup li
- **meetup / MeetUp.** Different products. meetup: What's the move? | MeetUp: Find availabilities with your co-workers or friends within a click!
- **Orion.** Different products. Orion: AI-powered wildfire operations dashboard with autonomous agents, live video streaming, and voice control—transforming emergency response thr | Orion: The onboarding buddy that's been a part of 
- **Relay.** Different products. Relay: Postman AI Agent Automation that transforms vague and slow product requirements into detailed pull requests in 30 seconds | Relay: Allowing developers to collaborate. Multi-agent development th
- **Sentinel.** Different products. Sentinel: Full-stack AI for bare-metal embedded systems. Proven by shipping a complete bare-metal OS on Raspberry Pi from scratch in 24 hours. | Sentinel: Sentinel is an AI security engineer that scan
- **Story Builder.** Different products. Story Builder: Craft Tales, Embrace Books | Story Builder: A storytelling game where you and your friends piece together a story word by word, that uses AI models after you're done to find a real-lif
- **Manifest.** Different products. Manifest: Listed on Berkeley SkyDeck's public companies directory. SkyDeck does not publish founder names on this page, and the program is not limited | Manifest: Gen Z mental health. 15.8 million man
- **River / River Markets.** Different products. River: The AI desktop. | River Markets: Prime brokerage for prediction markets
- **Scout / Scout Robotics.** Different products. Scout: AI insights for consumer products | Scout Robotics: Autonomous infrastructure robotics. Tejas Agarwal's GitHub bio says he is the founder.

## Dead or shut down

- Dead startups marked: 8
- Atla
- Boston Quantum
- Dome
- Leafpress
- Q2Q
- Rovr
- Selera Medical
- camfer
- Acquired startups marked: 6
- Bud
- Central
- Chatter
- Continue
- Nexa Labs
- ZeroEntropy

## Verification totals

Startup verification before this audit, then after.

| | Before | After |
| --- | ---: | ---: |
| confirmed | 1164 | 1211 |
| partial | 514 | 678 |
| unverified | 246 | 101 |
| null | 73 | 5 |

Investable companies after: 1872 (companies overall: 1995).

## Systematic source problems

- LinkedIn profile URLs are a login wall. They were counted and left unchanged so a concurrent LinkedIn enrichment is not overwritten.
- YC `ycdc_status` stays Active after some acquisitions. Bud is one case: YC still says Active, while a TechCrunch article documents the Figma acquisition. Shutdown and acquisition marks used the company site, the YC status, and press pages whose text names the company.
- Shared directory pages (Venture Lab, SkyDeck, Pennovation, Devpost) are one URL for many claims. A claim is disputed only when the fetched article text is long enough to read and does not contain the entity name, or when the URL is a hard 404 or a dead domain. Script-only pages and truncated extracts are treated as inconclusive.
- HTTP 403 and 429 were treated as blocked, not as evidence the company is gone.
- DuckDuckGo HTML and Google HTML returned bot challenges or empty result markup from this environment. Bing answered some queries, but its links are tracking wrappers, so headlines were used only when they named the company.
- Search engines that returned links: bing (141 searches).

Re-run with `python3 scripts/audit/accuracy-audit.py`. A second run reuses /tmp/audit/accuracy-fetch.sqlite and does not repeat a stored correction.
