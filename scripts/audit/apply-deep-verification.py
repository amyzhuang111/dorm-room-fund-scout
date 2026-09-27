#!/usr/bin/env python3
"""Apply the reviewed deep-verification decisions for the 442 unverified startups.

Reads /tmp/audit/deep-proposals.json (produced by deep-verify-unverified.py) and
updates existing rows only. A second run is a no-op once the corrected values
are stored.

  python3 scripts/audit/apply-deep-verification.py
"""

from __future__ import annotations

import json
import re
import secrets
import sqlite3
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "campus-universe.db"
PROPOSALS = Path("/tmp/audit/deep-proposals.json")
ORIGINAL = Path("/tmp/audit/unverified-442.json")
REPORT = ROOT / "scripts" / "audit" / "DEEP_VERIFICATION_REPORT.md"
DATE = "2026-09-27"

# Confirmed only after the live page title and domain were checked by hand
# against the stored description and campus. Everything else the fetcher
# marked "confirmed" was a namesake, a directory, or a different product.
ALLOW_CONFIRM = {
    "Adalat AI", "AdaptaPlay", "Airalux Medical", "Anthum AI", "Asakana",
    "AskSia Inc", "BLKHLTH", "Bobaface", "CaseFlo", "CaseLink", "Chemix",
    "Civic", "Clad Labs", "Colombiando", "Dandy", "EpiVario", "Flick",
    "Graphon AI", "HaloBraid", "Hammurabi", "Hey Kahani", "Hypknowledge",
    "Infralytica", "Kfans", "Kint", "Knit Health", "Mbodi AI", "Microforge",
    "Mohan", "Neuralert", "Nori", "Parfait", "Pipeline (formerly Techstack)",
    "Promakhos Therapeutics", "Sancho, Inc.", "Soundboard", "StrongHolt",
    "Tally.AI", "TeOra Pte Ltd", "Trevarx", "Vasowatch", "Vetigenics",
    "Vytrina", "Elevation Partners", "Stenoa", "Sava",
}

# Course projects the fetcher matched to a different company with the same name.
FORCE_DROP = {"Handled"}

# Partly-verified hits that are a different organization, a placeholder, or a
# class-project writeup that does not identify this row.
REJECT_PARTIAL = {
    "Iceberg Systems", "MedVision", "Polyview", "Calicosol", "LAINEY", "Mindful",
    "Curate", "Alpha-c", "ChefMark", "OPEN Laboratories", "Air23", "Quasara",
    "Lyvely", "Candr", "Neurometabolic Optical Monitor (NOM)", "Prism Optics",
}

# Do not store these URLs as the company website even if a search result used them.
REJECT_WEBSITE = REJECT_PARTIAL | {
    "Kyma", "Verra", "Navi", "Atelic", "Vado", "Orca", "EmBrace", "Galileo",
    "BlockBridge", "Qadence", "Aeronyx", "Swarm", "Belong Health", "InFLOWS AI",
    "SwitchPoint AI",
}

OVERRIDES = {
    "Sava": {
        "action": "confirmed",
        "website": "https://www.savahq.com",
        "description": "The intelligence layer for enduring legacies.",
        "source_url": "https://www.ycombinator.com/companies/savahq",
        "excerpt": "Sava: The intelligence layer for enduring legacies.",
        "note": "YC Fall 2025 company page and https://www.savahq.com match this Illini cohort company. An Amsterdam jewelry brand with the same name is a different business.",
    },
    "Stenoa": {
        "action": "confirmed",
        "website": "https://www.stenoa.com/",
        "description": "A fully integrated platform for mission critical healthcare coordination, secure communication, and real-time analytics.",
        "source_url": "https://www.stenoa.com/",
        "excerpt": "Stenoa | Mission Critical Care Coordination Software",
        "note": "stenoa.com is mission-critical care coordination software. Harvard President's Innovation Challenge finalist Jeremy Levett is named on the company site.",
    },
    "Elevation Partners": {
        "action": "confirmed",
        "website": "https://elevation.com/",
        "description": None,
        "source_url": "https://elevation.com/bretpearlman",
        "excerpt": "Elevation Partners. Bret Pearlman. Focused on the intersection between technology and media.",
        "note": "elevation.com identifies Elevation Partners and lists Bret Pearlman. This row is the growth-equity firm already described in the record, not a new student startup.",
    },
    "Vetigenics": {
        "action": "confirmed",
        "website": "https://vetigenics.com/",
        "description": None,
        "source_url": "https://vetigenics.com/latest-news/vetigenics-receives-startup-of-the-year-award-from-penn-center-for-innovation/",
        "excerpt": "Vetigenics Receives Startup of the Year Award from Penn Center for Innovation.",
        "note": "vetigenics.com reports the Penn Center for Innovation startup award for its canine phage-display platform.",
    },
    "Mohan": {
        "action": "confirmed",
        "website": "https://mohan.media/",
        "description": "Generative AI for resource definition. Built by researchers from MIT EAPS, CSAIL, and the Media Lab.",
        "source_url": "https://mohan.media/",
        "excerpt": "Generative AI for resource definition. Built by researchers from MIT EAPS, CSAIL, and the Media Lab.",
        "note": "mohan.media describes the MIT subsurface-modeling company, matching the MIT $100K listing.",
    },
    "Zorbe": {
        "action": "confirmed",
        "website": "https://zorbe.ai",
        "description": "Zorbe builds company-owned AI models that beat the frontier. Backed by a16z speedrun and Pareto Holdings.",
        "source_url": "https://zorbe.ai",
        "excerpt": "Zorbe builds company-owned AI models that beat the frontier. Backed by a16z speedrun and Pareto Holdings.",
        "note": "zorbe.ai describes company-owned models and says the company is backed by a16z speedrun, matching the SR007 listing.",
    },
    "Asearis": {
        "action": "confirmed",
        "website": "https://asearis.com/",
        "description": None,
        "source_url": "https://asearis.com/",
        "excerpt": "We're building next generation cloud computing solutions today.",
        "note": "asearis.com describes next-generation cloud computing, matching the decentralised-compute description from the Anderson Draper Showcase.",
    },
    "GrowthFactor": {
        "action": "partial",
        "website": "https://www.growthfactor.ai/",
        "description": "GrowthFactor is the AI analyst for commercial real estate. Ask in plain English and it runs site selection.",
        "source_url": "https://www.growthfactor.ai/",
        "excerpt": "GrowthFactor is the AI analyst for commercial real estate.",
        "note": "growthfactor.ai's indexed homepage describes an AI analyst for commercial real estate. Direct fetch returned HTTP 429, so this is partly verified.",
    },
    "Leonidas": {
        "action": "partial",
        "website": None,
        "description": None,
        "source_url": "https://speedrun.a16z.com/companies/leonidas",
        "excerpt": "Leonidas - speedrun",
        "note": "a16z speedrun has a company page titled Leonidas. That page does not publish a separate website.",
    },
    "Carisma Therapeutics": {
        "action": "partial",
        "website": None,
        "description": None,
        "source_url": "https://www.bizjournals.com/philadelphia/news/2025/12/16/carisma-therapeutics-philadelphia-cell-therapy.html",
        "excerpt": "Philadelphia's Carisma Therapeutics winds down operations.",
        "note": "Philadelphia Business Journal headline identifies Carisma Therapeutics as a Philadelphia cell-therapy company. carismatx.com did not complete a TLS handshake, so no website was stored.",
    },
    "Handled": {
        "action": "drop",
        "website": None,
        "description": None,
        "source_url": "https://devpost.com/software/handled",
        "excerpt": "Handled brings your family's appointments, school calendar, and parent network into one app.",
        "note": "Penn Engineering EAS 5490 Spring 2026 course project on Devpost. itshandled.ai is a different CPG company, so no website was stored. Removed from the startup list.",
    },
    "SwitchPoint AI": {
        "action": "partial",
        "website": None,
        "description": None,
        "source_url": "https://www.thegarage.northwestern.edu/news/switchpoint-ai-wins-150-000-in-their-first-eve",
        "excerpt": "SwitchPoint AI wins $150,000 in their first event.",
        "note": "The Garage at Northwestern reports SwitchPoint AI winning $150,000. A same-name product site was not tied to that article, so no website was stored.",
    },
}


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(9)}"


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def boilerplate(description: str | None) -> bool:
    low = (description or "").strip().lower()
    if len(low) < 25:
        return True
    needles = (
        "not yet researched", "skydeck does not publish", "spark grant recipient",
        "listed on berkeley skydeck", "penn-licensed startup listed",
        "eight illini-founded", "product/sector not yet researched",
    )
    return any(n in low for n in needles)


def clean_description(text: str | None) -> str | None:
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) < 40 or len(text) > 320:
        return None
    low = text.lower()
    if any(bad in low for bad in ("og:title", "cookie", "javascript", "just a moment", "access denied", "geeksforgeeks")):
        return None
    return text


def upsert_fact(db: sqlite3.Connection, project_id: str, fact_key: str, value: str, source_url: str, excerpt: str, origin: str) -> None:
    row = db.execute(
        "SELECT id FROM company_facts WHERE project_id=? AND fact_key=? ORDER BY rowid LIMIT 1",
        (project_id, fact_key),
    ).fetchone()
    if row:
        db.execute(
            "UPDATE company_facts SET value_text=?, source_url=?, excerpt=?, origin=? WHERE id=?",
            (value, source_url, excerpt[:300], origin, row["id"]),
        )
        return
    db.execute(
        """INSERT INTO company_facts
           (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin)
           VALUES (?, ?, ?, ?, NULL, NULL, '{}', ?, ?, ?)""",
        (new_id("fact"), project_id, fact_key, value, source_url, excerpt[:300], origin),
    )


def set_status(db: sqlite3.Connection, project_id: str, status: str, note: str) -> None:
    db.execute(
        "UPDATE projects SET verification_status=?, last_verified_at=?, verification_note=?, updated_at=COALESCE(updated_at, ?) WHERE id=?",
        (status, DATE, note, DATE, project_id),
    )


def set_website(db: sqlite3.Connection, project_id: str, url: str, source_url: str, excerpt: str) -> None:
    db.execute("UPDATE projects SET website_url=? WHERE id=?", (url, project_id))
    upsert_fact(db, project_id, "website", url, source_url, excerpt or url, "company_site")


def set_description(db: sqlite3.Connection, project_id: str, text: str, source_url: str, excerpt: str) -> None:
    db.execute("UPDATE projects SET description=? WHERE id=?", (text, project_id))
    upsert_fact(db, project_id, "description", text, source_url, excerpt or text[:240], "company_site")


def other_investable(db: sqlite3.Connection, person_id: str, project_id: str) -> bool:
    row = db.execute(
        """SELECT 1 FROM person_project_roles r
           JOIN projects p ON p.id=r.project_id
           WHERE r.person_id=? AND p.id!=? AND p.kind='company' AND p.is_investable_candidate=1
           LIMIT 1""",
        (person_id, project_id),
    ).fetchone()
    return row is not None


def drop_project(db: sqlite3.Connection, project_id: str, note: str) -> list[str]:
    db.execute("UPDATE projects SET is_investable_candidate=0 WHERE id=?", (project_id,))
    set_status(db, project_id, "unverified", note)
    moved = []
    founders = db.execute(
        """SELECT pe.id, pe.name, pe.founder_status FROM person_project_roles r
           JOIN people pe ON pe.id=r.person_id
           WHERE r.project_id=? AND r.role LIKE '%founder%'""",
        (project_id,),
    ).fetchall()
    for founder in founders:
        if other_investable(db, founder["id"], project_id):
            continue
        if founder["founder_status"] != "potential":
            db.execute("UPDATE people SET founder_status='potential' WHERE id=?", (founder["id"],))
        db.execute(
            "UPDATE people SET verification_status='partial', last_verified_at=?, verification_note=? WHERE id=?",
            (DATE, "Potential founder. Their company on record is a Spring 2026 EAS 5490 course project, which is not on the startup list.", founder["id"]),
        )
        moved.append(founder["name"])
    return moved


# tiffin.com is a Philadelphia restaurant. This row is chef software, so the name match was rejected.
SKIP = {"Tiffin"}


def decide(proposal: dict) -> dict | None:
    name = proposal["name"]
    if name in SKIP:
        return None
    if name in OVERRIDES:
        data = dict(proposal)
        data.update(OVERRIDES[name])
        return data
    if name in FORCE_DROP or proposal["action"] == "drop":
        data = dict(proposal)
        data["action"] = "drop"
        return data
    if proposal["action"] == "confirmed" and name in ALLOW_CONFIRM:
        return proposal
    if proposal["action"] == "partial" and name not in REJECT_PARTIAL:
        data = dict(proposal)
        if name in REJECT_WEBSITE or not data.get("website"):
            data["website"] = None
        return data
    return None


def family(source_name: str) -> str:
    s = (source_name or "").lower()
    rules = [
        ("Penn Venture Lab VIP-X", ("vip-x", "vip alumni")),
        ("Harvard President's Innovation Challenge", ("harvard president",)),
        ("President's Innovation Prize", ("innovation prize",)),
        ("Penn Venture Lab Startup Challenge / Bridge", ("startup challenge", "bridge award")),
        ("Penn Health-Tech", ("penn health-tech",)),
        ("PCI Ventures", ("pci",)),
        ("Penn Startup Showcase (Pennovation)", ("startup showcase", "pennovation")),
        ("Campus founder hotspots", ("hotspot",)),
        ("Startup Columbia", ("startup columbia",)),
        ("CMU Project Olympus / CMU News", ("olympus", "cmu news")),
        ("a16z speedrun", ("speedrun",)),
        ("Velocity (Waterloo)", ("velocity",)),
        ("MIT delta v", ("delta v",)),
        ("Penn Engineering EAS 5490 (Devpost)", ("eas 5490", "devpost")),
        ("Y-Prize", ("y-prize",)),
        ("Princeton Keller eLab", ("keller",)),
        ("StartX", ("startx",)),
        ("GRASP Lab", ("grasp",)),
        ("Stanford STVP", ("stvp",)),
        ("Daily Pennsylvanian / Penn press", ("daily pennsylvanian",)),
        ("MIT $100K", ("$100k", "100k")),
        ("Georgia Tech CREATE-X", ("create-x",)),
        ("M&T", ("m&t",)),
        ("Y Combinator directory", ("y combinator",)),
        ("Wharton / other Penn press", ("wharton",)),
        ("Teragen Energy article", ("teragen",)),
        ("Cardinal Ventures", ("cardinal",)),
        ("YesPress", ("yespress",)),
        ("Penn Labs alumni search", ("penn labs",)),
        ("Kleiner Perkins Fellows", ("kleiner",)),
        ("WUEC", ("wuec",)),
    ]
    for label, keys in rules:
        if any(k in s for k in keys):
            return label
    return source_name or "Unknown source"


def source_campus(source_name: str, source_url: str) -> str:
    blob = f"{source_name} {source_url}".lower()
    rules = [
        ("Penn", ("venture lab", "vip-x", "penn health", "pci", "pennovation", "grasp", "y-prize", "eas 5490", "innovation prize", "wharton", "m&t", "daily pennsylvanian", "upenn", "penn ")),
        ("Berkeley", ("skydeck", "berkeley", "haas", "teragen")),
        ("Harvard", ("harvard",)),
        ("Columbia", ("columbia",)),
        ("CMU", ("cmu", "olympus")),
        ("MIT", ("delta v", "$100k", "100k")),
        ("Waterloo", ("velocity",)),
        ("Stanford", ("startx", "stvp", "cardinal", "stanford")),
        ("Georgia Tech", ("create-x", "gatech")),
        ("Princeton", ("keller", "princeton")),
        ("Illinois", ("illinois", "illini")),
        ("Northwestern", ("northwestern", "garage")),
    ]
    for campus, keys in rules:
        if any(k in blob for k in keys):
            return campus
    if "hotspot" in blob or "speedrun" in blob or "y combinator" in blob:
        return "Multi-campus"
    return "Unassigned"


def failure_reason(note: str) -> str:
    low = (note or "").lower()
    if low.startswith("no company website or yc") or "no company website" in low:
        return "No company website on record, only the program or source page"
    if low.startswith("website was fetched"):
        return "Stored website did not load or did not name the company"
    if any(k in low for k in ("redirect", "gambling", "unrelated", "different", "resolves to", "presents ", "is treats", "is basis", "is azimov", "is cardinal", "is hoplynk", "is meridian", "is sam", "trustexam", "hustlebot")):
        return "Stored domain was a different company, a redirect, or spam"
    if "linkedin" in low and "login" in low:
        return "Only a LinkedIn company URL, and it was a login wall"
    return "Other website mismatch"


def write_report(original: list[dict], applied: list[dict]) -> None:
    fam = Counter(family((r.get("earliest") or {}).get("source_name") or "") for r in original)
    campuses = Counter()
    no_campus = 0
    for row in original:
        found = row.get("campuses") or []
        if not found:
            no_campus += 1
        for campus in found:
            campuses[campus] += 1
    src_campus = Counter(source_campus((r.get("earliest") or {}).get("source_name") or "", (r.get("earliest") or {}).get("source_url") or "") for r in original)
    reasons = Counter(failure_reason(r.get("verification_note") or "") for r in original)
    outcomes = Counter(a["action"] for a in applied)
    # Rows with no decision stay unverified.
    outcomes["unverified"] += len(original) - len(applied)

    def examples(action: str, n: int = 6) -> list[str]:
        lines = []
        for row in applied:
            if row["action"] != action:
                continue
            site = row.get("website") or ""
            lines.append(f"- **{row['name']}** — {row['note']}{(' Website: ' + site) if site else ''}")
            if len(lines) >= n:
                break
        return lines

    lines = [
        "# Deep verification of unverified startups",
        "",
        f"Second pass, {DATE}. Starts from the 442 companies left unverified by the first audit.",
        "A company is **confirmed** when its own live site titles itself with that name.",
        "It is **partly verified** when a public page (news, accelerator profile, LinkedIn company page, YC, or Product Hunt) identifies it and no own site could be confirmed.",
        "Course projects with no continuation are taken off the startup list (`is_investable_candidate = 0`). People whose only company was that project are marked potential founders.",
        "Namesakes, directories, and pages about a different organization were left unverified.",
        "",
        "## Why the 442 were unverified",
        "",
        "Counts are one row, one original source: the earliest project claim.",
        "",
        "### By original source",
        "",
    ]
    for label, count in fam.most_common():
        lines.append(f"- {label}: {count}")
    lines += [
        "",
        f"Source families sum to {sum(fam.values())}.",
        "",
        "### By campus",
        "",
        "Source campus is the school the importing list is about. SkyDeck rows often have no founder attached, so they show up as Berkeley here and as no-affiliation below.",
        "",
    ]
    for label, count in src_campus.most_common():
        lines.append(f"- {label}: {count}")
    lines += [
        "",
        "Founder affiliation (a company can count in more than one school):",
        "",
    ]
    lines.append(f"- No founder campus on the row: {no_campus}")
    for label, count in campuses.most_common():
        lines.append(f"- {label}: {count}")
    lines += [
        "",
        "### Why the first pass failed them",
        "",
    ]
    for label, count in reasons.most_common():
        lines.append(f"- {label}: {count}")
    lines += [
        "",
        "Among the 135 stored websites, the fetch broke down as DNS failure 44, TLS or certificate error 28, HTTP 404 24, HTTP 403 16, timeout 6, HTTP 429 3, another HTTP error 6, and 8 pages that loaded but did not name the company. The 20 domain mismatches are separate: those URLs had already been cleared because they pointed at a different product or at spam.",
        "",
        "## What changed",
        "",
        f"- Confirmed: {outcomes['confirmed']}",
        f"- Partly verified: {outcomes['partial']}",
        f"- Removed from the startup list / reclassified: {outcomes['drop']}",
        f"- Still unverified: {outcomes['unverified']}",
        "",
        "### Confirmed",
        "",
        *examples("confirmed"),
        "",
        "### Partly verified",
        "",
        *examples("partial"),
        "",
        "### Removed or reclassified",
        "",
        *examples("drop", 8),
        "",
        "### Still unverified, with a checked namesake",
        "",
        "- **Verra** — verra.org is the climate-standards nonprofit, not the a16z speedrun company.",
        "- **Kyma** — kyma-project.io is the CNCF project, not the delta v company at kyma.health.",
        "- **Vado** — vado.com is a bathroom-fittings manufacturer, not the Venture Lab team.",
        "- **Navi** — navi.gg is the Natus Vincere esports club, not the Columbia startup.",
        "- **Swarm** — swarm.aero is a defense-autonomy company; the hotspot row is a bug-repellent venture.",
        "- **Galileo** — galileo.ai is an AI-evaluation company and was not tied to the PCI spinout of the same name.",
        "- **Tiffin** — tiffin.com is a Philadelphia restaurant. This VIP-X row is chef software, so the restaurant domain was not stored.",
        "",
        "Nothing was filled in by guessing a domain. Reddit was not used as a source.",
        "",
    ]
    REPORT.write_text("\n".join(lines) + "\n")


def main() -> None:
    proposals = json.loads(PROPOSALS.read_text())
    original = json.loads(ORIGINAL.read_text())
    db = connect()
    applied = []
    for proposal in proposals:
        decision = decide(proposal)
        if not decision:
            continue
        pid = decision["id"]
        row = db.execute("SELECT id, description, website_url, verification_status FROM projects WHERE id=?", (pid,)).fetchone()
        if not row or row["verification_status"] not in (None, "unverified"):
            continue
        action = decision["action"]
        note = decision.get("note") or ""
        source = decision.get("source_url") or ""
        excerpt = decision.get("excerpt") or ""
        if action == "drop":
            moved = drop_project(db, pid, note)
            decision["moved"] = moved
            applied.append(decision)
            continue
        status = "confirmed" if action == "confirmed" else "partial"
        set_status(db, pid, status, note)
        website = decision.get("website")
        if website and decision["name"] not in REJECT_WEBSITE:
            set_website(db, pid, website, source or website, excerpt)
        description = decision.get("description") or ""
        description = clean_description(description)
        if description and boilerplate(row["description"]):
            set_description(db, pid, description, source or website or "", excerpt or description)
        applied.append(decision)
    db.commit()
    write_report(original, applied)
    counts = Counter(a["action"] for a in applied)
    print("applied", dict(counts), "of", len(proposals))
    print("report", REPORT)


if __name__ == "__main__":
    main()
