@AGENTS.md

# Reddit / Community Signal Layer

> **Verification status (2026-09-21):** the schema, types, UI, and manual-entry
> form this section describes are implemented (`lib/domain/community-signal.ts`,
> `lib/actions/community-signal.ts`, `components/community-signal-form.tsx`,
> the "Community" column/section on `/sources`). The specific per-organization
> claims below ("Reddit evidence: repeatedly recommended...", the confidence
> ratings, the "revised best founder club" list) are **NOT verified** — a
> real attempt was made to check them (direct `reddit.com`/`old.reddit.com`
> JSON API calls returned 403/bot-wall even with full browser headers; 6
> varied `site:reddit.com` and general web searches across Berkeley/Penn/
> Stanford returned zero Reddit results, only official pages and press). No
> actual Reddit thread has been read. Treat every confidence rating and
> "Reddit evidence" bullet below as an unverified hypothesis to check once
> real Reddit access exists (the official Reddit API, `oauth.reddit.com`,
> needs a `client_id`/`client_secret` this environment doesn't have) — never
> as a citable source_url for a `claims` row. Do not promote any of it into
> the live database without independently reading the actual thread.

## Purpose

Official university websites tell Scout:

> What organizations exist?

Reddit and other student-community discussions help answer:

> Which organizations do students themselves believe contain the
> strongest builders/founders?

These are different questions. Campus Scout must use both.

## 1. Community evidence is a source-ranking input

Reddit should influence:

- campus source discovery
- source prioritization
- source tier review
- identification of hidden builder communities
- identification of overrated / overly broad official programs
- discovery of high-signal courses, labs and informal communities

Reddit must NOT directly affect:

- Founder Signal
- investment score
- eligibility
- company traction
- founder technical ability

**Correct:** Reddit repeatedly points toward Penn Labs → increase priority
for building a Penn Labs adapter → inspect Penn Labs projects / contributors
→ actual technical evidence determines Founder Signal.

**Wrong:** Reddit says Penn Labs is good → a Penn Labs member receives +15
Founder Signal.

## 2. Add community signal to the source model

```ts
Source {
  ...
  founderScoutTier
  startupScoutTier

  communitySignal?
  communityConfidence?   // high | medium | low | insufficient
  redditMentionCount?
  redditIndependentMentions?
  redditPositiveMentions?
  redditNegativeMentions?
  communityRationale?
  redditLastCheckedAt?
}
```

Do not mechanically score Reddit comments. Use these fields to preserve the
evidence behind a human's source classification.

## 3. Reddit confidence

Community evidence is classified based on quality:

- **HIGH** — multiple independent campus-community discussions point toward
  the same organization/community. Prefer: multiple commenters, different
  threads, comments from students/alumni, descriptions of actual experience,
  recent discussion, specific explanations of why the source is useful.
- **MEDIUM** — one strong thread, or multiple weak mentions.
- **LOW** — a single anecdote.
- **INSUFFICIENT** — no useful campus-specific discussion found. Do NOT
  convert absence of Reddit discussion into negative evidence.

## 4. Insider disclosure

A comment from a club president, officer, member, or program employee is
useful for factual operational detail, but it is NOT independent community
validation.

Example: an E@B officer says "15–20 admitted from 200–300 applicants" — useful
for a selectivity hypothesis. But "officer says E@B is best" should not count
as an independent endorsement.

Store `commenterRelationship` (member | officer | alumni | student | unknown)
where self-disclosed.

## 5. Community consensus > single hot take

Do not tier a source from one Reddit comment — look for repeated patterns.

Example (Berkeley E@B): independent comments recommending it first when asked
for entrepreneurship groups, describing it as the center of entrepreneurship,
describing it as the top startup club, and an officer describing a selective
cohort and startup-building program → meaningful community evidence.

Versus: one anonymous user saying "Club X sucks" → insufficient evidence to
downgrade a source.

## 6. Reddit is particularly useful for finding hidden sources

Search queries should include (per campus):

```
site:reddit.com/r/{campus} best startup clubs
site:reddit.com/r/{campus} entrepreneurship clubs
site:reddit.com/r/{campus} startup founders
site:reddit.com/r/{campus} builders
site:reddit.com/r/{campus} best CS clubs
site:reddit.com/r/{campus} technical clubs
site:reddit.com/r/{campus} hackathon
site:reddit.com/r/{campus} founders actually
site:reddit.com/r/{campus} where startup people hang out
site:reddit.com/r/{campus} cofounder
site:reddit.com/r/{campus} incubator
site:reddit.com/r/{campus} "building"
```

Also search specific candidate organizations by name.

## 7. Search for negative signal too

Use community discussion to identify: organization mostly social,
organization mostly consulting, organization hard to distinguish from a
networking club, program broad/inclusive rather than selective, source with
prestigious branding but little actual building, inactive/dead club, program
no longer respected by students.

Treat all negative commentary as anecdotal until corroborated.

## 8. Community signal categories

```
BUILDER_DENSITY
FOUNDER_DENSITY
SELECTIVITY
PROJECT_QUALITY
STARTUP_ACTIVITY
COFOUNDER_NETWORK
ACTIVE_COMMUNITY
CONSULTING_HEAVY
NETWORKING_HEAVY
DOWNSTREAM
INACTIVE
UNKNOWN
```

These describe source/community characteristics (implemented as
`CommunitySignalCategory` in `lib/domain/community-signal.ts`).

## 9. Berkeley — Reddit-backed ranking (unverified, see status note above)

**Entrepreneurs @ Berkeley** — Founder Scout S, Startup Scout A/S, Community
Confidence HIGH. Reddit evidence (unverified): repeatedly recommended when
students ask for startup groups; independently described as central/top
entrepreneurship organization; self-identified officer described selective
intake; members actively start/continue businesses; close-knit cohort.
Interpretation: E@B is a genuine current-undergrad founder community, not
merely an entrepreneurship mailing list. Priority: P0.

**Free Ventures** — Founder Scout S+, Startup Scout S, Community Confidence
MEDIUM. Reddit evidence (unverified): repeatedly named as established
startup/VC ecosystem organization; appears alongside Berkeley's serious
founder infrastructure. Primary tier should still rely more heavily on
student-native selection structure, portfolio/outcomes, current founder
cohorts than Reddit popularity alone. Priority: P0.

**WDB (Web Development at Berkeley)** — Founder Scout S, Startup Scout C/B,
Community Confidence LOW/insufficient from current Reddit research.
IMPORTANT: do NOT downgrade WDB because Reddit discussion is limited — its
high tier comes from direct build evidence (real project teams, technical
ownership, deployed systems). Reddit signal is supplementary.

**Cal Hacks** — Founder Scout S, Startup Scout B. Community evidence should
focus on which teams continued, recurring builders, student perception of
quality. Do not score participation.

**SkyDeck** — Founder Scout C, Startup Scout B. Community evidence: often
mentioned as part of Berkeley's startup ecosystem, but this does not
establish it as the best current-student founder source. Keep downstream
classification.

## 10. Penn — Reddit-backed ranking (unverified, see status note above)

**Penn Labs** — Founder Scout S, Startup Scout C, Community Confidence HIGH.
Reddit evidence (unverified): repeatedly recommended as a serious CIS
organization; students describe technical selection around demonstrated
ability; project-building ability appears important; recommended alongside
actual engineering build organizations. Reinforces Penn Labs as one of
Penn's best Founder Scout feeds. Priority: P0.

**Hack4Impact** — Founder Scout A, Startup Scout C, Community Confidence
MEDIUM/HIGH. Reddit evidence (unverified): recommended alongside Penn Labs
as a place to build real software, with nonprofit clients. Prioritize tech
leads, project leads, repeat contributors, independently building members —
membership alone remains weak.

**Penn Electric Racing** — Founder Scout A, Startup Scout C, Community
Confidence MEDIUM. Reddit surfaces it as a practical engineering
organization where software engineers can do actual build work. Use
primarily for embedded/hardware/controls/software engineering leadership.

**Penn Aerial Robotics** — Founder Scout A, Startup Scout C, Community
Confidence MEDIUM. Similar logic to Electric Racing — strong only where
individual technical ownership is visible.

**M&T** — Founder Scout source tier S+, standalone evidence strength D,
Community Confidence MEDIUM. Reddit characterizes it as small, close-knit,
extremely career-driven, high startup/tech/VC interest, meaningful
AI/startup participation. Use as a high-density search pool. NEVER assign
founder points just for M&T membership. Priority: P0 identity graph.

**Broad entrepreneurship infrastructure** (Venture Lab, Pennovation) —
community signal MIXED: some Reddit discussions praise the resources; others
explicitly argue the people building the most interesting things may not be
concentrated in the formal entrepreneurship center. Use these for
startup/company discovery — do not assume they are the best founder
discovery layer.

## 11. Stanford — Reddit-backed ranking (unverified, see status note above)

**BASES** — Founder Scout S/A, Startup Scout A, Community Confidence
MEDIUM/HIGH. Reddit evidence (unverified): Stanford students recommend BASES
specifically as an entrepreneurship club and place to meet other people
interested in startups. Use challenge participants, active builders,
leadership, teams, alumni company formation. Do not treat membership alone
as Founder Signal.

**Cardinal Ventures** — Founder Scout A, Startup Scout A/S, Community
Confidence MEDIUM. Reddit startup-resource threads specifically point
students toward Cardinal Ventures. Treat as a selection layer.

**StartX** — Founder Scout B/A, Startup Scout S, Community Confidence
MEDIUM. Reddit recommends StartX as a startup resource/mentor network, but
this is more downstream than a TreeHacks project, student project,
technical lab, or early builder community. Use primarily for Startup Scout.

**TreeHacks** — Founder Scout S, Startup Scout A/B. Community Confidence: do
not infer from current Reddit dataset alone — tier comes mainly from
observable projects, teams, technical building, continuation potential.
Illustrates an important rule: **Reddit is not required for an S-tier
source.**

## 12. Harvard — Reddit-backed ranking (unverified, see status note above)

**Harvard Innovation Labs (i-lab)** — Founder Scout A/B, Startup Scout S/A,
Community Confidence HIGH. Reddit repeatedly identifies i-lab as the central
entrepreneurship community (unverified). But distinguish "walked into i-lab"
from "accepted team actively building in i-lab" — the latter is meaningful.
Community discussions also emphasize building independently, using summers,
startup internships, turning a thesis into a company. Scout should therefore
also search project/thesis artifacts, not only i-lab rosters.

## 13. MIT — do not invent Reddit consensus

Current Reddit search produced insufficient high-quality campus-specific
discussion to confidently identify a single "best founding club." Set
`communityConfidence = insufficient`, then rely on observed founder outcomes,
official cohort structure, public team rosters, project outputs until
additional community evidence is collected. **Never fill the gap with a
guess.** (Applied more broadly in this repo: every campus above is currently
in this same "insufficient — access blocked" state, not just MIT; see the
status note at the top of this section.)

## 14. Reddit should discover courses too

Reddit frequently identifies high-signal courses that university
entrepreneurship landing pages underemphasize. Source type: `PROJECT_COURSE`.
Search: capstone, software engineering, product design, entrepreneurship
implementation, robotics project course, AI project course, senior design.
Only ingest PUBLIC outputs (demo pages, GitHub, final project galleries,
team websites) — never scrape private class rosters.

## 15. Reddit should discover informal communities

Potential source types: `FOUNDER_HOUSE`, `BUILDER_HOUSE`, `COOP`,
`PROJECT_TEAM`, `STUDENT_LAB`, `FOUNDER_DINNER`, `DISCORD_COMMUNITY`,
`SLACK_COMMUNITY`. Only ingest data that is legitimately public — do not
attempt to penetrate private communities. A private group can still be
recorded as `manual_source` for human sourcing.

## 16. Community signal UI

Source detail should show, roughly:

```
Entrepreneurs @ Berkeley
Founder Scout     S
Startup Scout     A/S

Community signal
HIGH

Why
Multiple Berkeley community discussions identify E@B
as a central startup organization.

Community notes
• selective cohort
• members actively build businesses
• strong social founder network

Caveat
Some detailed claims come from current E@B members/officers.

[Community evidence]
```

Implemented as the "Community signal" block in `components/source-card.tsx`
(confidence badge, categories, rationale, mention counts, and a fixed
"source-priority input only — never scored into Founder Signal, eligibility,
or investment score" line).

## 17. Campus playbook UI

Add a **Community signal** column, e.g.:

```
Source        Founder    Startup    Community
Penn Labs     S          C          High
M&T           S+ pool    A          Medium
PennApps      S          B          Medium
Venture Lab   C          B          Mixed
```

Implemented as the "Community" column in the Registry table on `/sources`
(`app/sources/page.tsx`).

## 18. Reddit refresh

Campus-source Reddit research does not need daily scans. Refresh roughly
once per semester, or when: a source goes inactive, a source changes name, a
new organization appears, the user requests a campus refresh. Recent
discussions should generally receive more attention than 5–10-year-old club
recommendations; historical posts remain useful for long-lived
organizations.

## 19. Community signal ≠ truth

Reddit has selection bias, anonymous posters, club self-promotion, personal
grudges, stale information, very small samples. Therefore: Reddit should
influence SOURCE PRIORITY. Actual public evidence should establish what an
organization currently does, its current roster, current program structure,
actual projects, actual founder outcomes. Use both.

## Draft "best founder club/community" list (unverified — see status note)

This was the pasted synthesis at the intersection of community discussion +
actual observable work, kept here as a hypothesis to check, not as encoded
fact:

- **Penn:** `Penn Labs` as the clearest builder club; `M&T` as the strongest
  talent pool (not a club); `PennApps` as the strongest event/project
  source. Community discussion around formal entrepreneurship
  infrastructure said to be much more mixed.
- **Berkeley:** `Entrepreneurs @ Berkeley` as the strongest direct
  "best startup club" community evidence; Free Ventures as the higher-value
  startup selection layer; WDB as an exceptional builder source based more
  on what members actually ship than Reddit popularity.
- **Stanford:** `BASES` as the clearest Reddit-backed entrepreneurship club,
  `Cardinal Ventures` as the startup selection layer, `TreeHacks` as the
  better raw builder/project discovery source even though its S-tier
  designation comes from project structure rather than subreddit
  popularity.
- **Harvard:** Reddit said to point more strongly to the i-lab ecosystem
  than to one dominant undergraduate startup club, with students
  emphasizing actually working on a startup/thesis/summer project over
  just joining the entrepreneurship scene.
- **MIT:** left blank rather than inventing a "best club."
