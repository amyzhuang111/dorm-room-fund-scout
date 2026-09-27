#!/usr/bin/env python3
"""Apply cited corrections from the 2026-09-27 founder/startup audit.

Reads data/campus-universe.db and the page cache written by
verify-founders-startups.py. Updates existing rows only. Safe to re-run:
renames and role changes no-op once the corrected value is already stored.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("verify_founders_startups", ROOT / "scripts" / "audit" / "verify-founders-startups.py")
audit = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(audit)

DB_PATH = ROOT / "data" / "campus-universe.db"
DATE = "2026-09-27"
REPORT = ROOT / "scripts" / "audit" / "VERIFICATION_REPORT.md"

# Hosts that are cohort pages, press, or personal profiles shared across companies.
DIRECTORY_HOSTS = audit.DIRECTORY_HOSTS

# Stored website no longer resolves to that company (redirect, spam takeover, or a different product).
WRONG_SITES = {
    "Maive": "https://maive.ai redirects to ladderai.com (Ladder), checked 2026-09-27. YC still lists maive.ai; that domain is no longer Maive's site.",
    "Capivara": "https://www.getcapivara.com/ redirects to a gambling site (betflik88slots.com), checked 2026-09-27.",
    "Chiyo": "https://nourimama.co/ is an unrelated Japanese classifieds page, checked 2026-09-27.",
    "Enerza Inc": "https://enerza.io/ resolves to an unrelated casino page, checked 2026-09-27.",
    "Pyoneer": "https://pyoneer.io resolves to an unrelated gambling page, checked 2026-09-27.",
    "Too Collective": "https://toocollective.com/ resolves to an unrelated gambling page, checked 2026-09-27.",
    "Calicosol": "https://www.calicosol.co/ resolves to an unrelated gambling page, checked 2026-09-27.",
    "Ezra AI Labs": "https://ezraailabs.tech resolves to greenhouse.com, a different company, checked 2026-09-27.",
    "Growth Labs": "https://www.trytreats.com is Treats, a snack subscription, not Growth Labs.",
    "Leafpress": "https://www.trycardinal.ai/ is Cardinal AI, not Leafpress.",
    "Luvu": "https://withbasis.co/ is Basis, not Luvu.",
    "Color": "https://www.azimov.ai/ is Azimov, not Color.",
    "Verra": "https://trymeridian.dev/ is Meridian, not Verra.",
    "Logos AI": "https://www.hoplynk.com is Hoplynk, not Logos AI.",
    "Accountstory": "https://www.accountstory.com/ resolves to HustleBot, a different product, checked 2026-09-27.",
    "PropulsionAI, Inc.": "https://propulsionhq.com presents Fay, not PropulsionAI, checked 2026-09-27.",
    "Examus": "https://examus.com resolves to TrustExam. No source confirms that rebrand, so the website was cleared.",
    "Bicameral": "https://www.bicameral.io/ redirects to examflow.io (ExamFlow). No source confirms that rebrand.",
    "Visualize, Inc.": "https://visualizeme.ai redirects to avixscan.com (AVIX). No source confirms that rebrand.",
    "Quo Labs": "https://withsam.com is Sam, a senior companion. No source confirms it is Quo Labs.",
}


def new_id(prefix: str) -> str:
    import secrets
    return f"{prefix}_{secrets.token_urlsafe(9)}"


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    for table, cols in {
        "projects": ("verification_status TEXT", "last_verified_at TEXT", "verification_note TEXT"),
        "people": ("verification_status TEXT", "last_verified_at TEXT", "verification_note TEXT"),
    }.items():
        have = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
        for col in cols:
            name = col.split()[0]
            if name not in have:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {col}")
    return db


def project_id(db: sqlite3.Connection, name: str) -> str:
    row = db.execute("SELECT id FROM projects WHERE kind='company' AND name=?", (name,)).fetchone()
    if not row:
        raise SystemExit(f"missing company {name}")
    return row["id"]


def upsert_fact(db: sqlite3.Connection, project_id_: str, fact_key: str, value: str, source_url: str, excerpt: str, origin: str) -> None:
    row = db.execute(
        "SELECT id FROM company_facts WHERE project_id=? AND fact_key=? ORDER BY rowid LIMIT 1",
        (project_id_, fact_key),
    ).fetchone()
    if row:
        db.execute(
            "UPDATE company_facts SET value_text=?, source_url=?, excerpt=?, origin=? WHERE id=?",
            (value, source_url, excerpt, origin, row["id"]),
        )
        return
    db.execute(
        """INSERT INTO company_facts
           (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin)
           VALUES (?, ?, ?, ?, NULL, NULL, '{}', ?, ?, ?)""",
        (new_id("fact"), project_id_, fact_key, value, source_url, excerpt, origin),
    )


def set_description(db: sqlite3.Connection, name: str, text: str, source_url: str, excerpt: str, origin: str) -> None:
    pid = project_id(db, name)
    db.execute("UPDATE projects SET description=? WHERE id=?", (text, pid))
    upsert_fact(db, pid, "description", text, source_url, excerpt, origin)


def set_website(db: sqlite3.Connection, name: str, url: str, source_url: str, excerpt: str, origin: str) -> None:
    pid = project_id(db, name)
    db.execute("UPDATE projects SET website_url=? WHERE id=?", (url, pid))
    upsert_fact(db, pid, "website", url, source_url, excerpt, origin)


def clear_website(db: sqlite3.Connection, name: str) -> None:
    pid = project_id(db, name)
    db.execute("UPDATE projects SET website_url=NULL WHERE id=?", (pid,))
    db.execute("DELETE FROM company_facts WHERE project_id=? AND fact_key='website'", (pid,))


def note(db: sqlite3.Connection, name: str, status: str, text: str) -> None:
    db.execute(
        "UPDATE projects SET verification_status=?, last_verified_at=?, verification_note=? WHERE name=? AND kind='company'",
        (status, DATE, text, name),
    )


def person_note(db: sqlite3.Connection, person_id: str, status: str, text: str) -> None:
    db.execute(
        "UPDATE people SET verification_status=?, last_verified_at=?, verification_note=? WHERE id=?",
        (status, DATE, text, person_id),
    )


def add_linkedin(db: sqlite3.Connection, person_name: str, url: str) -> bool:
    rows = db.execute("SELECT id, aliases_json FROM people WHERE name=?", (person_name,)).fetchall()
    changed = False
    for row in rows:
        try:
            aliases = json.loads(row["aliases_json"] or "[]")
        except json.JSONDecodeError:
            aliases = []
        if any(isinstance(a, str) and a.startswith("linkedin:http") for a in aliases):
            continue
        aliases.append(f"linkedin:{url}")
        db.execute("UPDATE people SET aliases_json=? WHERE id=?", (json.dumps(aliases), row["id"]))
        changed = True
    return changed


def main() -> None:
    db = connect()
    founders_before = db.execute(
        """SELECT COUNT(DISTINCT pe.id) c FROM people pe
           JOIN person_project_roles ppr ON ppr.person_id=pe.id
           JOIN projects p ON p.id=ppr.project_id AND p.kind='company' AND ppr.role LIKE '%founder%'"""
    ).fetchone()["c"]
    startups_before = db.execute("SELECT COUNT(*) c FROM projects WHERE kind='company'").fetchone()["c"]
    counts = {
        "website_cleared_directory": 0,
        "website_cleared_wrong": 0,
        "website_updated": 0,
        "name": 0,
        "description": 0,
        "role": 0,
        "enrollment": 0,
        "linkedin_added": 0,
        "link_removed": 0,
        "not_a_startup": 0,
    }

    # --- GitHub-bio misparses (bios re-read 2026-09-27) ---
    if db.execute("SELECT 1 FROM projects WHERE name='Anthropic'").fetchone():
        db.execute("UPDATE projects SET name=? WHERE name='Anthropic' AND kind='company'", ("Coefficient Bio",))
        counts["name"] += 1
    set_description(
        db,
        "Coefficient Bio",
        "Nathan C. Frey co-founded Coefficient Bio, later acquired by Anthropic. He is not a founder of Anthropic. Penn PhD, then an MIT postdoc.",
        "https://ncfrey.com/",
        "I co-founded Coefficient Bio, where we figured out how to make biotech company creation and operation hill-climbable. I lead drug discovery and development research at Anthropic. PhD in Materials Science & Engineering at the University of Pennsylvania.",
        "company_site",
    )
    clear_website(db, "Coefficient Bio")
    note(db, "Coefficient Bio", "partial", "Company name corrected from Anthropic. His GitHub company field is his employer; ncfrey.com says he co-founded Coefficient Bio. No Coefficient Bio website was confirmed, so the website was cleared.")
    counts["description"] += 1
    counts["website_cleared_wrong"] += 1
    frey = db.execute("SELECT id FROM people WHERE name='Nathan Frey'").fetchone()
    if frey:
        db.execute(
            """UPDATE people SET enrollment_status='older_alumni', enrollment_label=NULL, enrollment_grad_year=NULL,
               enrollment_basis='verified', enrollment_evidence=?, enrollment_source_url=?
               WHERE id=?""",
            (
                "Personal site: PhD in Materials Science & Engineering at Penn, then an MIT postdoc, then Genentech, then Coefficient Bio. Not a 2023–2026 graduate.",
                "https://ncfrey.com/",
                frey["id"],
            ),
        )
        person_note(db, frey["id"], "partial", "Founder of Coefficient Bio, not Anthropic. Enrollment corrected to older alumni from ncfrey.com. Class year is not stated.")
        counts["enrollment"] += 1

    peng = db.execute("SELECT id FROM people WHERE name='Steven Peng'").fetchone()
    horizon = project_id(db, "Horizon Robotics")
    if peng:
        changed = db.execute(
            "UPDATE person_project_roles SET role='employee' WHERE person_id=? AND project_id=? AND role LIKE '%founder%'",
            (peng["id"], horizon),
        ).rowcount
        counts["role"] += changed
        person_note(db, peng["id"], "partial", "GitHub bio says Humanoid Robotics @HorizonRobotics and Founder of PennEAI. Role on Horizon Robotics corrected from founder to employee.")
    clear_website(db, "Horizon Robotics")
    horizon_text = "Steven Peng's GitHub bio lists Horizon Robotics as an employer and PennEAI as the organization he founded. This row is not a startup he founded."
    db.execute("UPDATE projects SET is_investable_candidate=0, description=? WHERE id=?", (horizon_text, horizon))
    upsert_fact(db, horizon, "description", horizon_text, "https://github.com/zxpeng2007", "GitHub bio: Humanoid Robotics @HorizonRobotics; Founder, President @PennEAI.", "company_site")
    note(db, "Horizon Robotics", "partial", "Not his startup. GitHub bio (github.com/zxpeng2007) lists Horizon Robotics as an employer. Removed from startup candidates.")
    counts["description"] += 1
    counts["website_cleared_wrong"] += 1
    counts["not_a_startup"] += 1

    if db.execute("SELECT 1 FROM projects WHERE name='Skild AI, CMU'").fetchone():
        db.execute("UPDATE projects SET name='Skild AI' WHERE name='Skild AI, CMU'")
        counts["name"] += 1
    set_description(
        db, "Skild AI",
        "General-purpose robotic intelligence. Deepak Pathak is co-founder and CEO.",
        "https://www.skild.ai/",
        "Skild AI — General Purpose Robotic Intelligence. Building general purpose robotic intelligence.",
        "company_site",
    )
    set_website(db, "Skild AI", "https://www.skild.ai/", "https://www.skild.ai/", "Live site title: Skild AI — General Purpose Robotic Intelligence.", "company_site")
    upsert_fact(db, project_id(db, "Skild AI"), "founded_year", "2023", "https://www.cs.cmu.edu/~dpathak/CV_Pathak.pdf", "Co-Founder and CEO of Skild AI. Founded 2023.", "company_site")
    note(db, "Skild AI", "confirmed", "Name corrected from “Skild AI, CMU”. Website skild.ai. Founded 2023 on Pathak's CMU CV. He is CEO and co-founder per cs.cmu.edu/~dpathak.")
    counts["description"] += 1
    counts["website_updated"] += 1
    pathak = db.execute("SELECT id FROM people WHERE name='Deepak Pathak'").fetchone()
    if pathak:
        db.execute(
            """UPDATE people SET enrollment_status='older_alumni', enrollment_label='19', enrollment_grad_year=2019,
               enrollment_basis='verified', enrollment_evidence=?, enrollment_source_url=? WHERE id=?""",
            (
                "CV: PhD candidate in Computer Science, UC Berkeley, Aug 2014 – Aug 2019. Now faculty at Carnegie Mellon and CEO of Skild AI.",
                "https://www.cs.cmu.edu/~dpathak/CV_Pathak.pdf",
                pathak["id"],
            ),
        )
        person_note(db, pathak["id"], "confirmed", "Berkeley PhD 2019 per his CMU CV, so older alumni rather than a recent grad. Co-founder and CEO of Skild AI.")
        counts["enrollment"] += 1

    if db.execute("SELECT 1 FROM projects WHERE name='SyntheticFi. Ex-Stripe'").fetchone():
        db.execute("UPDATE projects SET name='SyntheticFi' WHERE name='SyntheticFi. Ex-Stripe'")
        counts["name"] += 1
    set_description(
        db, "SyntheticFi",
        "Borrow against investments at low rates, for financial advisors. Tony Yang, a UC Berkeley graduate and former Stripe engineer, is cofounder and CEO.",
        "https://www.syntheticfi.com/about-us",
        "Tony Yang is the Cofounder and CEO of SyntheticFi. Before founding SyntheticFi, he was a Senior Software Engineer at Stripe. He earned degrees in computer science and philosophy from UC Berkeley.",
        "company_site",
    )
    set_website(db, "SyntheticFi", "https://www.syntheticfi.com/", "https://www.syntheticfi.com/", "Live site title: SyntheticFi - cheapest way to borrow money.", "company_site")
    upsert_fact(db, project_id(db, "SyntheticFi"), "founded_year", "2023", "https://www.ycombinator.com/companies/syntheticfi", "YC company page: Founded in 2023.", "yc_page")
    note(db, "SyntheticFi", "confirmed", "Name corrected from “SyntheticFi. Ex-Stripe”. Website syntheticfi.com. YC S23 page and the about page name Tony Yang as cofounder and CEO.")
    counts["description"] += 1
    counts["website_updated"] += 1
    if add_linkedin(db, "Tony Yang", "https://www.linkedin.com/in/yucheng-tony-yang"):
        counts["linkedin_added"] += 1
        tony = db.execute("SELECT id FROM people WHERE name='Tony Yang'").fetchone()
        if tony:
            person_note(db, tony["id"], "confirmed", "LinkedIn /in/yucheng-tony-yang matches the cofounder named on syntheticfi.com/about-us and the YC page. Berkeley graduate; class year is not stated.")

    set_description(
        db, "AITI",
        "Aviation Instrument Technologies designs and manufactures aircraft instruments, cockpit displays, and control panels.",
        "https://aircraftinstruments.com/",
        "AITI designs and manufactures aircraft instruments, cockpit displays, multi-function displays, and control panels.",
        "company_site",
    )
    set_website(db, "AITI", "https://aircraftinstruments.com/", "https://aircraftinstruments.com/", "Live site title: Aviation Instrument Technologies, Inc.", "company_site")
    note(db, "AITI", "confirmed", "Website corrected from a GitHub profile to aircraftinstruments.com, the URL in David Teichman's GitHub blog field. His bio says he founded Aviation Instrument Technologies Inc.")
    counts["description"] += 1
    counts["website_updated"] += 1

    set_description(
        db, "Fluid",
        "Social VR browser with built-in screen sharing. John Dagdelen's GitHub bio says he is the founder.",
        "https://fluid.so/",
        "Fluid - Social VR browser with built in screen sharing.",
        "company_site",
    )
    set_website(db, "Fluid", "https://fluid.so/", "https://github.com/jdagdelen", "GitHub bio: Founder, Fluid.so. The site fluid.so is titled Fluid - Social VR browser.", "company_site")
    note(db, "Fluid", "confirmed", "Website corrected from a GitHub profile to fluid.so, named in John Dagdelen's GitHub bio.")
    counts["description"] += 1
    counts["website_updated"] += 1

    set_description(
        db, "Scout Robotics",
        "Autonomous infrastructure robotics. Tejas Agarwal's GitHub bio says he is the founder.",
        "https://scoutrobo.com/",
        "Scout Robotics | Autonomous Infrastructure. GitHub bio: Founder @ Scout.",
        "company_site",
    )
    note(db, "Scout Robotics", "confirmed", "scoutrobo.com is live and titled Scout Robotics. Founder claim is his own GitHub bio (github.com/jetag).")
    counts["description"] += 1

    teen = project_id(db, "TeenHacksLI")
    set_website(db, "TeenHacksLI", "https://www.teenhacksli.com/", "https://github.com/jeffreyyu101", "GitHub blog field jeffreyyu.org and the live site teenhacksli.com. Bio: Co-Founder of TeenHacksLI.", "company_site")
    teen_text = "TeenHacks LI is a student hackathon. Jeffrey Yu's GitHub bio says he is a co-founder and a current Penn student. It is not a venture."
    db.execute("UPDATE projects SET is_investable_candidate=0, description=? WHERE id=?", (teen_text, teen))
    upsert_fact(
        db, teen, "description", teen_text, "https://github.com/jeffreyyu101",
        "GitHub bio: Co-Founder of @TeenHacksLI. Current Economics and Computer Science student at The University of Pennsylvania.",
        "company_site",
    )
    note(db, "TeenHacksLI", "partial", "Website corrected from a GitHub profile to teenhacksli.com. Removed from startup candidates because it is a hackathon, not a company.")
    counts["description"] += 1
    counts["website_updated"] += 1
    counts["not_a_startup"] += 1

    if db.execute("SELECT 1 FROM projects WHERE name='z-institute'").fetchone():
        db.execute("UPDATE projects SET name='The Z Institute' WHERE name='z-institute'")
        counts["name"] += 1
    clear_website(db, "The Z Institute")
    set_description(
        db, "The Z Institute",
        "Lee Ting Ting's GitHub bio calls her founder and CEO of The Z Institute. No company website was confirmed (the stored URL was her Medium profile).",
        "https://github.com/tina1998612",
        "Founder & CEO at The Z Institute. UC Berkeley.",
        "company_site",
    )
    note(db, "The Z Institute", "partial", "Name taken from her GitHub bio. Medium profile removed as the company website.")
    counts["description"] += 1
    counts["website_cleared_wrong"] += 1

    # --- Canonical URLs cited by YC or the live site ---
    set_website(
        db, "BetterBasket", "https://betterbasket.com/",
        "https://www.ycombinator.com/companies/betterbasket",
        "YC lists http://www.betterbasket.com. betterbasket.ai redirects there.",
        "yc_page",
    )
    note(db, "BetterBasket", "confirmed", "Website updated from betterbasket.ai to betterbasket.com, the URL on the YC page. .ai redirects there.")
    counts["website_updated"] += 1

    if db.execute("SELECT 1 FROM projects WHERE name='TrueValuaHub'").fetchone():
        db.execute("UPDATE projects SET name='True ValueHub' WHERE name='TrueValuaHub'")
        counts["name"] += 1
    note(db, "True ValueHub", "confirmed", "Name corrected to the live site title: True ValueHub (truevaluehub.com).")

    # Nexa's stored founders are not on the YC page that was cited.
    nexa = project_id(db, "Nexa Labs")
    for person_name in ("Kyle Berkson", "Samuel Xie"):
        person = db.execute("SELECT id FROM people WHERE name=?", (person_name,)).fetchone()
        if not person:
            continue
        removed = db.execute(
            "DELETE FROM person_project_roles WHERE person_id=? AND project_id=? AND role LIKE '%founder%'",
            (person["id"], nexa),
        ).rowcount
        counts["role"] += removed
        still = db.execute(
            """SELECT COUNT(*) c FROM person_project_roles ppr JOIN projects p ON p.id=ppr.project_id
               WHERE ppr.person_id=? AND p.kind='company' AND ppr.role LIKE '%founder%'""",
            (person["id"],),
        ).fetchone()["c"]
        if still == 0:
            db.execute("UPDATE people SET founder_status=NULL WHERE id=? AND founder_status='founder'", (person["id"],))
        db.execute(
            """UPDATE claims SET verification_state='disputed', excerpt=?
               WHERE entity_id=? AND source_url LIKE '%ycombinator.com/companies/nexa-labs%'""",
            (
                "Re-fetched 2026-09-27: the YC page lists Zarif Azher (Founder/CEO) and Kenneth Chan (Founder), not this person. Founder link removed.",
                person["id"],
            ),
        )
        person_note(db, person["id"], "partial", "Removed as a Nexa Labs founder. The YC page cited for that link lists Zarif Azher and Kenneth Chan.")
    set_website(
        db, "Nexa Labs", "https://nexa.farm/",
        "https://www.ycombinator.com/companies/nexa-labs",
        "YC company page website: https://nexa.farm/. One-liner: Implantable microchips and AI for cattle monitoring.",
        "yc_page",
    )
    note(db, "Nexa Labs", "partial", "YC page lists founders Zarif Azher and Kenneth Chan. Kyle Berkson and Samuel Xie were removed because that page does not name them. Website set from the YC page.")
    counts["website_updated"] += 1

    # Alex Liu was attached to tryprism; YC's tryprism founders are Theo Kitsberg and Axel La Pira.
    # A different YC company, /companies/prism, is the one that names Alex Liu.
    prism = project_id(db, "Prism")
    for person in db.execute(
        """SELECT pe.id FROM people pe
           JOIN person_project_roles ppr ON ppr.person_id=pe.id
           WHERE pe.name='Alex Liu' AND ppr.project_id=? AND ppr.role LIKE '%founder%'""",
        (prism,),
    ):
        db.execute(
            "DELETE FROM person_project_roles WHERE person_id=? AND project_id=? AND role LIKE '%founder%'",
            (person["id"], prism),
        )
        counts["role"] += 1
        still = db.execute(
            """SELECT COUNT(*) c FROM person_project_roles ppr JOIN projects p ON p.id=ppr.project_id
               WHERE ppr.person_id=? AND p.kind='company' AND ppr.role LIKE '%founder%'""",
            (person["id"],),
        ).fetchone()["c"]
        if still == 0:
            db.execute("UPDATE people SET founder_status=NULL WHERE id=? AND founder_status='founder'", (person["id"],))
        db.execute(
            """UPDATE claims SET verification_state='disputed', excerpt=?
               WHERE entity_id=? AND source_url='https://www.ycombinator.com/companies/prism'""",
            (
                "This bio is on ycombinator.com/companies/prism (prisminference.com, “Abundant Intelligence for Everyone”), not on tryprism.com. Removed from the tryprism recruiting company.",
                person["id"],
            ),
        )
        person_note(db, person["id"], "partial", "Linked to the wrong Prism. tryprism.com founders are Theo Kitsberg and Axel La Pira. Alex Liu is named on a different YC company, /companies/prism.")
    note(db, "Prism", "confirmed", "tryprism.com matches the YC page (AI-native recruiting). Alex Liu was removed; he is named on a different YC company at /companies/prism.")

    meteor_page = audit.fetch("https://browse.dev")
    meteor_blob = " ".join([meteor_page.get("title") or "", meteor_page.get("text") or ""])
    if meteor_page.get("ok") and re.search(r"meteor|browser", meteor_blob, re.I):
        set_website(db, "Meteor", "https://browse.dev/", "https://www.ycombinator.com/companies/meteor", "YC website https://browse.dev. Page identifies Meteor as a browser.", "yc_page")
        note(db, "Meteor", "confirmed", "Website set from the YC page (browse.dev). Farhan Khan's name is on that YC page along with Pranav Madhukar.")
        counts["website_updated"] += 1

    note(
        db, "Keye", "partial",
        "YC's current page (keye.co, private-equity software, founded 2024) lists Rohan Parikh, Conor Brown, and Lalit Lal. Penn Venture Lab's 2022–23 pages list Paolo Fornasini, Niha Gottiparthy, and Ruthwick Patthireddy on a subscription product also named Keye (venturelab.upenn.edu/vip-alumni). Both sets are kept, with that distinction.",
    )

    # Jay Kwon's YC LinkedIn is /in/soonjae. A GitHub user @soonjae is named Soonjae Kim; that link was inferred from the slug.
    jay = db.execute("SELECT id FROM people WHERE name='Jay Kwon'").fetchone()
    if jay:
        removed = db.execute(
            """DELETE FROM claims WHERE entity_id=? AND claim_type='profile_link'
               AND (value_json LIKE '%soonjae%' OR excerpt LIKE '%soonjae%')
               AND (value_json LIKE '%github%' OR excerpt LIKE '%GitHub%')""",
            (jay["id"],),
        ).rowcount
        counts["link_removed"] += removed
        person_note(db, jay["id"], "partial", "YC lists Jay Kwon, Founder/CTO of Scoop, with LinkedIn /in/soonjae. GitHub @soonjae is named Soonjae Kim and was not confirmed as the same person, so that GitHub link was removed.")

    for person_name, url in (
        ("Lucas Raskin", "https://www.linkedin.com/in/lucas-r-422937242/"),
        ("Neer Jain", "https://www.linkedin.com/in/neer-jain/"),
        ("Warren Shepard ’26", "https://www.linkedin.com/in/warren-shepard-493a37201/"),
        ("Ian Shi", "https://www.linkedin.com/in/ruian-shi-4b5215b9/"),
    ):
        if add_linkedin(db, person_name, url):
            counts["linkedin_added"] += 1

    # Shared directory / press URLs are sources, not company websites.
    for row in db.execute("SELECT id, name, website_url, primary_link FROM projects WHERE kind='company' AND website_url IS NOT NULL"):
        host = audit.host_of(row["website_url"])
        if host not in DIRECTORY_HOSTS:
            continue
        if row["name"] in ("Coefficient Bio", "Horizon Robotics", "The Z Institute"):
            continue
        db.execute("UPDATE projects SET website_url=NULL WHERE id=?", (row["id"],))
        db.execute("DELETE FROM company_facts WHERE project_id=? AND fact_key='website' AND value_text=?", (row["id"], row["website_url"]))
        if not row["primary_link"]:
            db.execute(
                "UPDATE projects SET primary_link=?, primary_link_kind='press' WHERE id=?",
                (row["website_url"], row["id"]),
            )
        existing = db.execute("SELECT verification_note FROM projects WHERE id=?", (row["id"],)).fetchone()["verification_note"]
        if not existing:
            note(db, row["name"], "partial", f"Website cleared. {row['website_url']} is a shared directory or article, not this company's site. Kept as the source page.")
        counts["website_cleared_directory"] += 1

    for name, reason in WRONG_SITES.items():
        row = db.execute("SELECT id, name, website_url, verification_note FROM projects WHERE kind='company' AND name=?", (name,)).fetchone()
        if not row or not row["website_url"]:
            continue
        cached = audit.load_cached(audit.CACHE / "web" / f"{audit.cache_key(row['website_url'])}.json")
        if cached and cached.get("ok"):
            blob = " ".join([cached.get("title") or "", cached.get("description") or "", cached.get("text") or ""])
            if audit.name_in_text(row["name"], blob):
                continue
        clear_website(db, name)
        if not row["verification_note"]:
            note(db, name, "unverified", reason)
        counts["website_cleared_wrong"] += 1

    # Series stored a news article as the website.
    series = db.execute("SELECT id, website_url, primary_link FROM projects WHERE name='Series' AND kind='company'").fetchone()
    if series and series["website_url"] and "hartfordbusiness.com" in series["website_url"]:
        if not series["primary_link"]:
            db.execute(
                "UPDATE projects SET primary_link=?, primary_link_kind='press', website_url=NULL WHERE id=?",
                (series["website_url"], series["id"]),
            )
        else:
            db.execute("UPDATE projects SET website_url=NULL WHERE id=?", (series["id"],))
        db.execute("DELETE FROM company_facts WHERE project_id=? AND fact_key='website'", (series["id"],))
        note(db, "Series", "partial", "Hartford Business Journal article moved out of the website field. It is a press page, not the company site.")
        counts["website_cleared_wrong"] += 1

    hdax = db.execute("SELECT id, website_url FROM projects WHERE name='HDAX Therapeutics'").fetchone()
    if hdax and hdax["website_url"] and "linkedin.com/company/" in hdax["website_url"]:
        upsert_fact(
            db, hdax["id"], "company_linkedin", hdax["website_url"], hdax["website_url"],
            "Stored URL is a LinkedIn company page, not a marketing website. The fetch hit a LinkedIn login wall, so the company was not confirmed.",
            "company_site",
        )
        clear_website(db, "HDAX Therapeutics")
        note(db, "HDAX Therapeutics", "unverified", "LinkedIn company URL was stored as the website and only resolved to a login wall. Moved to the LinkedIn field. Company site remains unverified.")
        counts["website_cleared_wrong"] += 1

    fill_unchecked(db)
    db.commit()

    startups = db.execute("SELECT verification_status, COUNT(*) c FROM projects WHERE kind='company' GROUP BY verification_status").fetchall()
    founders = db.execute(
        """SELECT pe.verification_status, COUNT(DISTINCT pe.id) c
           FROM people pe JOIN person_project_roles ppr ON ppr.person_id=pe.id
           JOIN projects p ON p.id=ppr.project_id AND p.kind='company' AND ppr.role LIKE '%founder%'
           GROUP BY pe.verification_status"""
    ).fetchall()
    print("CORRECTIONS", json.dumps(counts, indent=2))
    print("STARTUPS", [(r["verification_status"], r["c"]) for r in startups])
    print("FOUNDERS", [(r["verification_status"], r["c"]) for r in founders])
    write_report(db, counts, startups_before, founders_before)
    db.close()


def fill_unchecked(db: sqlite3.Connection) -> None:
    """Set status for rows this pass did not correct by hand, using the fetch cache."""
    slug_of: dict[str, str] = {}
    for row in db.execute("SELECT project_id, source_url FROM company_facts WHERE source_url LIKE '%ycombinator.com/companies/%'"):
        match = re.search(r"companies/([a-z0-9-]+)", row["source_url"])
        if match:
            slug_of[row["project_id"]] = match.group(1)
    for row in db.execute("SELECT id, primary_link FROM projects WHERE kind='company' AND primary_link LIKE '%ycombinator.com/companies/%'"):
        match = re.search(r"companies/([a-z0-9-]+)", row["primary_link"] or "")
        if match:
            slug_of.setdefault(row["id"], match.group(1))

    yc_founders: dict[str, set[str]] = {}
    for pid, slug in slug_of.items():
        cached = audit.load_cached(audit.CACHE / "yc" / f"{audit.cache_key('https://www.ycombinator.com/companies/' + slug)}.json")
        names = set()
        if cached and cached.get("ok"):
            for founder in (cached.get("yc") or {}).get("founders") or []:
                names.add(audit.fold(founder.get("name") or ""))
        yc_founders[pid] = names

    for row in db.execute("SELECT id, name, website_url, verification_status FROM projects WHERE kind='company'"):
        if row["verification_status"]:
            continue
        status, text = score_company(row["id"], row["name"], row["website_url"], slug_of.get(row["id"]))
        note(db, row["name"], status, text)

    people = db.execute(
        """SELECT DISTINCT pe.id, pe.name, pe.aliases_json, pe.verification_status
           FROM people pe
           JOIN person_project_roles ppr ON ppr.person_id=pe.id
           JOIN projects p ON p.id=ppr.project_id AND p.kind='company' AND ppr.role LIKE '%founder%'"""
    ).fetchall()
    roles = db.execute(
        """SELECT person_id, project_id FROM person_project_roles ppr
           JOIN projects p ON p.id=ppr.project_id AND p.kind='company' WHERE ppr.role LIKE '%founder%'"""
    ).fetchall()
    projects_of: dict[str, list[str]] = {}
    for role in roles:
        projects_of.setdefault(role["person_id"], []).append(role["project_id"])
    campuses = {row["person_id"] for row in db.execute("SELECT DISTINCT person_id FROM affiliations")}

    for person in people:
        if person["verification_status"]:
            continue
        on_yc = False
        for pid in projects_of.get(person["id"], []):
            if audit.fold(person["name"]) in yc_founders.get(pid, set()):
                on_yc = True
        urls = []
        try:
            aliases = json.loads(person["aliases_json"] or "[]")
        except json.JSONDecodeError:
            aliases = []
        for alias in aliases:
            if isinstance(alias, str) and alias.startswith("linkedin:http"):
                urls.append(alias[len("linkedin:"):])
        slug_ok = any(audit.slug_matches_person(person["name"], url) for url in urls)
        has_campus = person["id"] in campuses
        if on_yc and slug_ok:
            status, text = "confirmed", "Name is on the company's YC founder list and the LinkedIn slug matches."
        elif on_yc:
            status, text = "confirmed", "Name is on the company's YC founder list (fetched 2026-09-27)."
        elif slug_ok and has_campus:
            status, text = "confirmed", "LinkedIn slug matches the name. School is the campus already on the affiliation."
        elif slug_ok:
            status, text = "partial", "LinkedIn slug matches the name. No campus affiliation is on record."
        elif has_campus:
            status, text = "partial", "Campus affiliation is on record. No YC founder listing or matching LinkedIn slug was confirmed in this pass."
        else:
            status, text = "unverified", "No campus affiliation and no matching public profile were confirmed in this pass."
        person_note(db, person["id"], status, text)


def score_company(pid: str, name: str, website: str | None, slug: str | None) -> tuple[str, str]:
    yc_ok = False
    if slug:
        cached = audit.load_cached(audit.CACHE / "yc" / f"{audit.cache_key('https://www.ycombinator.com/companies/' + slug)}.json")
        yc = (cached or {}).get("yc") or {}
        if cached and cached.get("ok") and (yc.get("founders") or yc.get("founded_year")):
            yc_ok = True
    site_ok = False
    if website and audit.host_of(website) not in DIRECTORY_HOSTS:
        cached = audit.load_cached(audit.CACHE / "web" / f"{audit.cache_key(website)}.json")
        if cached and cached.get("ok"):
            blob = " ".join([cached.get("title") or "", cached.get("description") or "", cached.get("text") or "", cached.get("final_url") or ""])
            site_ok = audit.name_in_text(name, blob)
    if yc_ok and site_ok:
        return "confirmed", "YC company page and the live website both match the name (fetched 2026-09-27)."
    if yc_ok:
        return "confirmed", f"YC page ycombinator.com/companies/{slug} matches this company (fetched 2026-09-27)."
    if site_ok:
        return "confirmed", "Live website title or page text matches the company name (fetched 2026-09-27)."
    if website:
        return "unverified", "Website was fetched and did not confirm this company, or it did not respond."
    if slug:
        return "unverified", "YC page was requested and did not confirm this company."
    return "unverified", "No company website or YC page was on record to check."


def write_report(db: sqlite3.Connection, counts: dict, startups_before: int, founders_before: int) -> None:
    def tally(sql: str) -> dict[str, int]:
        return {(row["verification_status"] or "unset"): row["c"] for row in db.execute(sql)}

    startups = tally("SELECT verification_status, COUNT(*) c FROM projects WHERE kind='company' GROUP BY verification_status")
    founders = tally(
        """SELECT pe.verification_status, COUNT(DISTINCT pe.id) c
           FROM people pe JOIN person_project_roles ppr ON ppr.person_id=pe.id
           JOIN projects p ON p.id=ppr.project_id AND p.kind='company' AND ppr.role LIKE '%founder%'
           GROUP BY pe.verification_status"""
    )
    startup_n = sum(startups.values())
    founder_n = sum(founders.values())
    lines = [
        "# Founder and startup verification",
        "",
        "Checked 2026-09-27 against YC company pages, company websites, and the GitHub bios that had been turned into startups.",
        "A startup is **confirmed** when a live YC page or the company's own site matches the name.",
        "A founder is **confirmed** when that YC page lists them, or their LinkedIn slug matches their name and a campus is already on the record.",
        "Claims that failed those checks were corrected, cleared, or marked unverified. Nothing was filled in by guessing.",
        "",
        "## Counts",
        "",
        f"- Startups checked: {startups_before}",
        f"- Startups confirmed: {startups.get('confirmed', 0)}",
        f"- Startups partly verified: {startups.get('partial', 0)}",
        f"- Startups unverified: {startups.get('unverified', 0)}",
        "",
        f"- Founders checked (people who had a founder role when the audit started): {founders_before}",
        f"- Founders confirmed: {founders.get('confirmed', 0)}",
        f"- Founders partly verified: {founders.get('partial', 0)}",
        f"- Founders unverified: {founders.get('unverified', 0)}",
        "",
        "## Corrections by field",
        "",
        f"- Website cleared because it was a shared directory or press page: {counts['website_cleared_directory']}",
        f"- Website cleared because the domain was the wrong company, a redirect, or spam: {counts['website_cleared_wrong']}",
        f"- Website updated to a cited URL: {counts['website_updated']}",
        f"- Company name: {counts['name']}",
        f"- Description: {counts['description']}",
        f"- Founder role removed or changed: {counts['role']}",
        f"- Enrollment: {counts['enrollment']}",
        f"- LinkedIn added from a YC page or company about page: {counts['linkedin_added']}",
        f"- Profile link removed as a likely namesake: {counts['link_removed']}",
        f"- Removed from startup candidates (not a venture): {counts['not_a_startup']}",
        "",
        "## Examples",
        "",
        "- **Coefficient Bio (was Anthropic).** Nathan Frey's GitHub company field is Anthropic, his employer. [ncfrey.com](https://ncfrey.com/) says he co-founded Coefficient Bio, later acquired by Anthropic, after a Penn PhD and an MIT postdoc. The row was renamed, the GitHub URL was removed as the website, and his enrollment was corrected from an inferred recent grad to older alumni.",
        "- **Horizon Robotics.** The same GitHub-bio parser treated Steven Peng's employer as a company he founded. His bio says he works on humanoid robotics at Horizon Robotics and founded PennEAI. His role is now employee, and the row is no longer a startup candidate.",
        "- **Skild AI.** Stored as “Skild AI, CMU” with his faculty page as the website. [skild.ai](https://www.skild.ai/) is the company site. His [CV](https://www.cs.cmu.edu/~dpathak/CV_Pathak.pdf) says Skild AI was founded in 2023 and that his Berkeley PhD ran through August 2019.",
        "- **SyntheticFi.** Stored as “SyntheticFi. Ex-Stripe” with a GitHub profile as the website. The company site is [syntheticfi.com](https://www.syntheticfi.com/about-us); the YC page says founded in 2023 and names Tony Yang, a Berkeley graduate, as cofounder.",
        "- **Hijacked domains.** Capivara (`getcapivara.com`), Chiyo (`nourimama.co`), Maive (`maive.ai` → Ladder), and several others now resolve to unrelated or spam sites. Those websites were cleared rather than left pointing at the wrong company.",
        "- **Wrong Prism.** Alex Liu's YC bio is on [ycombinator.com/companies/prism](https://www.ycombinator.com/companies/prism) (inference). He had been attached to tryprism.com, whose founders are Theo Kitsberg and Axel La Pira. That link was removed.",
        "- **Nexa Labs.** The YC page lists Zarif Azher and Kenneth Chan. Kyle Berkson and Samuel Xie had been stored as founders from a citation of that same page, which does not name them. Their founder links were removed. The website `nexa.farm` is the one on the YC page.",
        "- **Scoop / Jay Kwon.** YC lists LinkedIn `/in/soonjae` for Jay Kwon. GitHub `@soonjae` is named Soonjae Kim and was only attached because the slug matched, so that GitHub link was removed.",
        "- **Keye.** Kept both founder sets, with a note: YC's current Keye (keye.co) lists Rohan Parikh, Conor Brown, and Lalit Lal; Penn Venture Lab's 2022–23 pages list Paolo Fornasini, Niha Gottiparthy, and Ruthwick Patthireddy on a subscription product of the same name.",
        "",
        "Directory and cohort URLs (UC Launch, Free Ventures, Thiel press, and similar) were removed from the website field and kept as the source page.",
        "",
        "Re-run the fetch with `python3 scripts/audit/verify-founders-startups.py`. Re-apply stored corrections with `python3 scripts/audit/apply-verification.py`.",
        "",
    ]
    REPORT.write_text("\n".join(lines))
    print(f"wrote {REPORT}")


if __name__ == "__main__":
    main()
