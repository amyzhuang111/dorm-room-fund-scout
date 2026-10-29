#!/usr/bin/env python3
"""Apply the 2026-10-29 Campus Scout data audit.

Priorities:
1. Fix Wrong rows (verify [CHECK HOMONYM] against source first).
2. Bulk-fill sector / founded_year / HQ from YC OSS (exact name or website host)
   then company-site schema.org. Never guess. Record provenance.
3. Replace dead s2 favicon logos with YC thumbs (HTTP 200 required).
4. Keep duplicate-name groups separate (no merges).

Writes a provenance log next to the DB and a JSON summary under /workspace/reviews.
"""
from __future__ import annotations

import csv
import json
import re
import secrets
import sqlite3
import ssl
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "campus-universe.db"
CORRECTIONS = Path("/workspace/reviews/campus-scout-corrections.csv")
YC_OSS = Path("/workspace/reviews/campus-scout-yc-oss-all.json")
YC_DETAILS = Path("/workspace/reviews/campus-scout-yc-details.json")
PROVENANCE_OUT = Path("/workspace/reviews/campus-scout-audit-apply/provenance.jsonl")
SUMMARY_OUT = Path("/workspace/reviews/campus-scout-audit-apply/summary.json")
ORIGIN = "data_audit_2026_10_29"

CTX = ssl.create_default_context()
UA = {"User-Agent": "CampusScoutDataAudit/1.0 (+local QA apply)"}

# True homonyms: Scout company is NOT the YC company the audit matched.
# Skip any correction that would overwrite with that YC company's facts.
HOMONYM_SKIP_IDS = {
    "proj_VA9__1ClKrxR",  # Flip (fliptexts.com) != YC Flip (justflip.com)
    "proj__i9SQS5Uck0z",  # Fulcrum (withfulcrum.com insurance) != YC Fulcrum (fulcrumresearch.ai)
}

# Wrong rows whose source_url points at the wrong YC company / unconfirmed claim.
SKIP_WRONG = {
    # Lark Scout row is lark-2 (Jason/Michael); correction cites /companies/lark (Vijit/Jack).
    ("proj_6x7ZHWHkhGgc", "founders"),
    # Site "2021" is research citations ("Since 2021"), not foundingDate; YC Familiar 404.
    ("proj_I_sBNQEjupur", "founded_year"),
}

# Confirmed YC renames (former_names on YC OSS). Apply name + current website.
RENAMES = {
    "proj_-b1JYtSi5py9": {  # Anaphero -> Clarion
        "new_name": "Clarion",
        "slug": "clarion",
        "website": "https://clarionhealth.com",
    },
    "proj_jMin-ajosaV9": {  # Vendo -> Gradon
        "new_name": "Gradon",
        "slug": "gradon",
        "website": "https://heygradon.com/",
    },
    "proj_0Tnttj5FNAfY": {  # Touchy -> Tokenless
        "new_name": "Tokenless",
        "slug": "tokenless",
        "website": "https://usetokenless.com",
    },
    "proj_2RybwdTQBhoh": {  # Lumify Care -> Adni
        "new_name": "Adni",
        "slug": "adni",
        "website": "https://www.adni.co/",
    },
    "proj_ZD-PumsaRg3K": {  # Napkin Math -> Paper Star
        "new_name": "Paper Star",
        "slug": "paper-star",
        "website": "https://paperstar.cc",
    },
    "proj_FzmnILQxyRS-": {  # Vision Lab -> Linewise
        "new_name": "Linewise",
        "slug": "linewise",
        "website": "https://linewise.io/",
    },
}

# Map free-text / YC industry-or-tag labels onto Scout sector ids.
SECTOR_MAP = {
    "ai_agents": "ai_agents",
    "ai agents/apps": "ai_agents",
    "ai": "ai_agents",
    "generative ai": "ai_agents",
    "machine learning": "ai_agents",
    "reinforcement learning": "ai_agents",
    "aiops": "ai_agents",
    "ai_infra": "ai_infra",
    "ai infrastructure": "ai_infra",
    "devtools": "dev_tools",
    "dev_tools": "dev_tools",
    "developer tools": "dev_tools",
    "data_infra": "data_infra",
    "data/infra": "data_infra",
    "cybersecurity": "cybersecurity",
    "fintech": "fintech",
    "finance": "fintech",
    "crypto_web3": "crypto_web3",
    "crypto": "crypto_web3",
    "web3": "crypto_web3",
    "blockchain": "crypto_web3",
    "healthtech": "healthtech",
    "health tech": "healthtech",
    "health": "healthtech",
    "healthcare": "healthtech",
    "digital health": "healthtech",
    "consumer health services": "healthtech",
    "mental health tech": "healthtech",
    "biotech": "biotech",
    "biotechnology": "biotech",
    "ai-powered drug discovery": "biotech",
    "drug discovery": "biotech",
    "medtech": "medtech",
    "medtech/devices": "medtech",
    "climate_energy": "climate_energy",
    "climate": "climate_energy",
    "energy": "climate_energy",
    "robotics_hardware": "robotics_hardware",
    "robotics/hardware": "robotics_hardware",
    "robotics": "robotics_hardware",
    "hardware": "robotics_hardware",
    "hard tech": "robotics_hardware",
    "manufacturing": "robotics_hardware",
    "industrials": "robotics_hardware",
    "construction": "robotics_hardware",
    "advanced materials": "robotics_hardware",
    "defense_gov": "defense_gov",
    "government": "defense_gov",
    "aerospace": "aerospace",
    "edtech": "edtech",
    "education": "edtech",
    "ai-enhanced learning": "edtech",
    "consumer": "consumer",
    "marketplaces": "marketplaces",
    "marketplace": "marketplaces",
    "ecommerce": "ecommerce",
    "e-commerce": "ecommerce",
    "enterprise_saas": "enterprise_saas",
    "enterprise": "enterprise_saas",
    "enterprise software": "enterprise_saas",
    "saas": "enterprise_saas",
    "b2b": "enterprise_saas",
    "workflow automation": "enterprise_saas",
    "productivity": "enterprise_saas",
    "compliance": "enterprise_saas",
    "documents": "enterprise_saas",
    "analytics": "data_infra",
    "proptech": "proptech",
    "real estate": "proptech",
    "real estate and construction": "proptech",
    "mobility": "mobility",
    "logistics": "mobility",
    "food_ag": "food_ag",
    "food": "food_ag",
    "agriculture": "food_ag",
    "media_creator": "media_creator",
    "media": "media_creator",
    "video": "media_creator",
    "social": "social",
    "gaming": "gaming",
    "legal": "legal",
    "legaltech": "legal",
    "hr_work": "hr_work",
    "recruiting": "hr_work",
    "human resources": "hr_work",
}


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(9)}"


def host_of(url: str | None) -> str | None:
    if not url:
        return None
    try:
        raw = url if "://" in url else "https://" + url
        host = urlparse(raw).hostname or ""
        host = host.lower().removeprefix("www.")
        return host or None
    except Exception:
        return None


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


def map_sector(raw: str | None) -> str | None:
    if not raw:
        return None
    # Take first token when CSV packed several labels.
    parts = re.split(r"[,;/|]", raw)
    for part in parts:
        key = part.strip().lower()
        if not key:
            continue
        if key in SECTOR_MAP:
            return SECTOR_MAP[key]
        # soft contains
        for needle, tag in SECTOR_MAP.items():
            if needle in key or key in needle:
                return tag
    return None


def http_status(url: str, timeout: float = 12.0) -> int | None:
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
                return int(resp.status)
        except urllib.error.HTTPError as e:
            return int(e.code)
        except Exception:
            if method == "GET":
                return None
    return None


def fetch_text(url: str, timeout: float = 15.0) -> str | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            if resp.status != 200:
                return None
            raw = resp.read(400_000)
            charset = resp.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace")
    except Exception:
        return None


def parse_schema_org(html: str) -> dict:
    """Extract founded year / HQ / sector hints from JSON-LD only. No guessing."""
    out: dict = {}
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        blob = m.group(1).strip()
        try:
            data = json.loads(blob)
        except Exception:
            continue
        nodes = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
        if isinstance(data, dict) and "@graph" not in data and "@type" in data:
            nodes = [data]
        for node in nodes:
            if not isinstance(node, dict):
                continue
            types = node.get("@type")
            type_l = " ".join(types if isinstance(types, list) else [str(types or "")]).lower()
            if "organization" not in type_l and "corporation" not in type_l and "localbusiness" not in type_l:
                # still accept foundingDate on any node
                pass
            fd = node.get("foundingDate") or node.get("founding_date")
            if fd and "founded_year" not in out:
                ym = re.search(r"(19|20)\d{2}", str(fd))
                if ym:
                    out["founded_year"] = ym.group(0)
            addr = node.get("address")
            if isinstance(addr, list) and addr:
                addr = addr[0]
            if isinstance(addr, dict) and "hq" not in out:
                city = addr.get("addressLocality") or addr.get("addressRegion")
                country = addr.get("addressCountry")
                if isinstance(country, dict):
                    country = country.get("name")
                bits = [b for b in [city, country] if b]
                if bits:
                    out["hq"] = ", ".join(str(b) for b in bits)
            if isinstance(addr, str) and "hq" not in out and len(addr) < 80:
                out["hq"] = addr
    return out


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


def upsert_fact(
    db: sqlite3.Connection,
    project_id: str,
    fact_key: str,
    value: str,
    source_url: str,
    excerpt: str,
    origin: str = ORIGIN,
) -> str:
    row = db.execute(
        "SELECT id, value_text FROM company_facts WHERE project_id=? AND fact_key=? ORDER BY rowid LIMIT 1",
        (project_id, fact_key),
    ).fetchone()
    if row:
        if (row["value_text"] or "").strip() == value.strip():
            db.execute(
                "UPDATE company_facts SET source_url=?, excerpt=?, origin=? WHERE id=?",
                (source_url, excerpt[:500], origin, row["id"]),
            )
            return "unchanged"
        db.execute(
            "UPDATE company_facts SET value_text=?, source_url=?, excerpt=?, origin=? WHERE id=?",
            (value, source_url, excerpt[:500], origin, row["id"]),
        )
        return "updated"
    db.execute(
        """INSERT INTO company_facts
           (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin)
           VALUES (?, ?, ?, ?, NULL, NULL, '{}', ?, ?, ?)""",
        (new_id("fact"), project_id, fact_key, value, source_url, excerpt[:500], origin),
    )
    return "inserted"


def upsert_sector(db: sqlite3.Connection, project_id: str, tag: str, source_url: str, excerpt: str) -> str:
    existing = db.execute(
        "SELECT id, tag FROM project_sector_tags WHERE project_id=? AND is_primary=1 ORDER BY rowid LIMIT 1",
        (project_id,),
    ).fetchone()
    if existing:
        if existing["tag"] == tag:
            return "unchanged"
        db.execute(
            "UPDATE project_sector_tags SET tag=?, excerpt=?, source_url=? WHERE id=?",
            (tag, excerpt[:500], source_url, existing["id"]),
        )
        db.execute("UPDATE projects SET sector=? WHERE id=?", (tag, project_id))
        return "updated"
    # any non-primary?
    any_row = db.execute(
        "SELECT id FROM project_sector_tags WHERE project_id=? LIMIT 1", (project_id,)
    ).fetchone()
    if any_row:
        return "skipped_has_nonprimary"
    db.execute(
        """INSERT INTO project_sector_tags (id, project_id, tag, is_primary, excerpt, source_url)
           VALUES (?, ?, ?, 1, ?, ?)""",
        (new_id("pst"), project_id, tag, excerpt[:500], source_url),
    )
    db.execute("UPDATE projects SET sector=? WHERE id=?", (tag, project_id))
    return "inserted"


def set_website(db: sqlite3.Connection, project_id: str, url: str, source_url: str) -> None:
    db.execute("UPDATE projects SET website_url=? WHERE id=?", (url, project_id))
    upsert_fact(db, project_id, "website", url, source_url, f"website={url}", ORIGIN)


def set_name(db: sqlite3.Connection, project_id: str, new_name: str, old_name: str, source_url: str) -> None:
    row = db.execute("SELECT name, aliases_json FROM projects WHERE id=?", (project_id,)).fetchone()
    if not row:
        return
    aliases = []
    try:
        aliases = json.loads(row["aliases_json"] or "[]")
    except Exception:
        aliases = []
    if not isinstance(aliases, list):
        aliases = []
    if old_name and old_name not in aliases and old_name != new_name:
        aliases.append(old_name)
    db.execute(
        "UPDATE projects SET name=?, aliases_json=? WHERE id=?",
        (new_name, json.dumps(aliases), project_id),
    )
    upsert_fact(db, project_id, "company_name", new_name, source_url, f"renamed from {old_name}", ORIGIN)


def replace_founders(db: sqlite3.Connection, project_id: str, names: list[str], source_url: str) -> None:
    """Replace founder roles for a project with the listed names (YC ground truth)."""
    existing = db.execute(
        """SELECT ppr.id as ppr_id, ppr.person_id, pe.name
           FROM person_project_roles ppr
           JOIN people pe ON pe.id=ppr.person_id
           WHERE ppr.project_id=? AND lower(ppr.role) LIKE '%founder%'""",
        (project_id,),
    ).fetchall()
    keep_norm = {normalize_name(n) for n in names}
    for row in existing:
        if normalize_name(row["name"]) in keep_norm:
            continue
        db.execute("DELETE FROM person_project_roles WHERE id=?", (row["ppr_id"],))
        # clear founder_status if no remaining founder roles
        left = db.execute(
            """SELECT 1 FROM person_project_roles WHERE person_id=? AND lower(role) LIKE '%founder%' LIMIT 1""",
            (row["person_id"],),
        ).fetchone()
        if not left:
            db.execute(
                "UPDATE people SET founder_status=NULL WHERE id=? AND founder_status='founder'",
                (row["person_id"],),
            )
    have = {
        normalize_name(r["name"])
        for r in db.execute(
            """SELECT pe.name FROM person_project_roles ppr
               JOIN people pe ON pe.id=ppr.person_id
               WHERE ppr.project_id=? AND lower(ppr.role) LIKE '%founder%'""",
            (project_id,),
        )
    }
    for name in names:
        nn = normalize_name(name)
        if not nn or nn in have:
            continue
        person = db.execute("SELECT id FROM people WHERE lower(name)=lower(?) LIMIT 1", (name,)).fetchone()
        if not person:
            pid = new_id("person")
            db.execute(
                "INSERT INTO people (id, name, aliases_json, founder_status) VALUES (?, ?, '[]', 'founder')",
                (pid, name),
            )
        else:
            pid = person["id"]
            db.execute(
                "UPDATE people SET founder_status='founder' WHERE id=?",
                (pid,),
            )
        claim = new_id("claim")
        db.execute(
            """INSERT INTO claims
               (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at, label, verification_state)
               VALUES (?, 'project', ?, 'founder', ?, ?, ?, datetime('now'), 'observed_fact', 'corroborated')""",
            (claim, project_id, json.dumps({"name": name, "role": "founder"}), f"YC founder {name}", source_url),
        )
        db.execute(
            """INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id)
               VALUES (?, ?, ?, 'founder', ?)""",
            (new_id("ppr"), pid, project_id, claim),
        )
        have.add(nn)


def coverage(db: sqlite3.Connection) -> dict:
    total = db.execute(
        "SELECT COUNT(*) c FROM projects WHERE kind='company' AND is_investable_candidate=1"
    ).fetchone()["c"]
    sector = db.execute(
        """SELECT COUNT(DISTINCT project_id) c FROM project_sector_tags pst
           JOIN projects p ON p.id=pst.project_id
           WHERE p.kind='company' AND p.is_investable_candidate=1"""
    ).fetchone()["c"]
    year = db.execute(
        """SELECT COUNT(DISTINCT cf.project_id) c FROM company_facts cf
           JOIN projects p ON p.id=cf.project_id
           WHERE p.kind='company' AND p.is_investable_candidate=1
             AND cf.fact_key='founded_year' AND trim(cf.value_text)!=''"""
    ).fetchone()["c"]
    hq = db.execute(
        """SELECT COUNT(DISTINCT cf.project_id) c FROM company_facts cf
           JOIN projects p ON p.id=cf.project_id
           WHERE p.kind='company' AND p.is_investable_candidate=1
             AND cf.fact_key='hq' AND trim(cf.value_text)!=''"""
    ).fetchone()["c"]
    logo = db.execute(
        """SELECT COUNT(DISTINCT cf.project_id) c FROM company_facts cf
           JOIN projects p ON p.id=cf.project_id
           WHERE p.kind='company' AND p.is_investable_candidate=1
             AND cf.fact_key IN ('logo','favicon','logo_url','favicon_url')
             AND trim(cf.value_text)!=''"""
    ).fetchone()["c"]
    return {
        "total": total,
        "sector": sector,
        "founded_year": year,
        "hq": hq,
        "logo": logo,
        "sector_pct": round(100.0 * sector / total, 1),
        "founded_year_pct": round(100.0 * year / total, 1),
        "hq_pct": round(100.0 * hq / total, 1),
        "logo_pct": round(100.0 * logo / total, 1),
    }


def load_yc_indexes(oss: list[dict]):
    by_name: dict[str, list[dict]] = defaultdict(list)
    by_host: dict[str, list[dict]] = defaultdict(list)
    by_slug: dict[str, dict] = {}
    for c in oss:
        by_slug[c["slug"]] = c
        by_name[normalize_name(c.get("name") or "")].append(c)
        for fn in c.get("former_names") or []:
            by_name[normalize_name(fn)].append(c)
        h = host_of(c.get("website"))
        if h:
            by_host[h].append(c)
    return by_name, by_host, by_slug


def match_yc(project: sqlite3.Row, by_name, by_host) -> dict | None:
    """Exact name or website host match. Ambiguous name with different hosts → None."""
    h = host_of(project["website_url"])
    if h and h in by_host:
        hits = by_host[h]
        if len(hits) == 1:
            return hits[0]
        # prefer exact name among host hits
        nn = normalize_name(project["name"])
        named = [c for c in hits if normalize_name(c.get("name") or "") == nn]
        if len(named) == 1:
            return named[0]
    nn = normalize_name(project["name"])
    hits = by_name.get(nn) or []
    if not hits:
        return None
    if len(hits) == 1:
        # still reject if website hosts conflict (homonym)
        yc_h = host_of(hits[0].get("website"))
        if h and yc_h and h != yc_h:
            return None
        return hits[0]
    # multiple same name: require host match
    if h:
        host_hits = [c for c in hits if host_of(c.get("website")) == h]
        if len(host_hits) == 1:
            return host_hits[0]
    return None


def yc_sector(company: dict) -> str | None:
    for tag in company.get("tags") or []:
        mapped = map_sector(str(tag))
        if mapped:
            return mapped
    for ind in company.get("industries") or []:
        mapped = map_sector(str(ind))
        if mapped:
            return mapped
    return map_sector(company.get("industry"))


def yc_hq(company: dict) -> str | None:
    loc = (company.get("all_locations") or company.get("regions") or "")
    # all_locations sometimes a string like "San Francisco, CA, USA; Remote"
    if isinstance(loc, list):
        loc = "; ".join(str(x) for x in loc)
    loc = str(loc or "")
    parts = [p.strip() for p in re.split(r"[;|]", loc) if p.strip()]
    for p in parts:
        if re.search(r"\bremote\b", p, re.I):
            continue
        return p
    return None


def yc_year_from_details(details: dict | None, company: dict) -> str | None:
    if details and details.get("detail"):
        y = details["detail"].get("year_founded")
        if y:
            return str(y)
    # Do NOT use batch year as founded_year.
    return None


def main() -> int:
    if not CORRECTIONS.exists():
        print("missing corrections", CORRECTIONS)
        return 1
    if not YC_OSS.exists():
        print("missing yc oss", YC_OSS)
        return 1

    oss = json.loads(YC_OSS.read_text())
    by_name, by_host, by_slug = load_yc_indexes(oss)
    details = {}
    if YC_DETAILS.exists():
        details = json.loads(YC_DETAILS.read_text())

    rows = list(csv.DictReader(CORRECTIONS.open()))
    PROVENANCE_OUT.parent.mkdir(parents=True, exist_ok=True)
    prov = PROVENANCE_OUT.open("w")

    summary = {
        "wrong": Counter(),
        "missing": Counter(),
        "fill": Counter(),
        "bulk": Counter(),
        "logos": Counter(),
        "skipped": [],
        "unverified": [],
        "before": {},
        "after": {},
        "founders_before": None,
        "founders_after": None,
        "campuses_before": None,
        "campuses_after": None,
    }

    db = connect()
    summary["before"] = coverage(db)
    summary["founders_before"] = db.execute(
        """SELECT COUNT(*) FROM person_project_roles ppr
           JOIN projects p ON p.id=ppr.project_id
           WHERE p.kind='company' AND p.is_investable_candidate=1 AND lower(ppr.role) LIKE '%founder%'"""
    ).fetchone()[0]
    summary["campuses_before"] = db.execute(
        "SELECT COUNT(*) FROM universities WHERE lat IS NOT NULL AND lon IS NOT NULL"
    ).fetchone()[0]

    def log_prov(**kwargs):
        prov.write(json.dumps(kwargs, ensure_ascii=False) + "\n")

    # ---------- 1. Confirmed renames ----------
    for pid, info in RENAMES.items():
        proj = db.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        if not proj:
            summary["skipped"].append({"id": pid, "reason": "rename target missing"})
            continue
        yc = by_slug.get(info["slug"])
        if not yc:
            summary["skipped"].append({"id": pid, "reason": f"YC slug missing {info['slug']}"})
            continue
        # Verify former_names contain old name
        formers = [normalize_name(x) for x in (yc.get("former_names") or [])]
        if normalize_name(proj["name"]) not in formers and normalize_name(proj["name"]) != normalize_name(info["new_name"]):
            # still allow if already renamed
            if normalize_name(proj["name"]) != normalize_name(info["new_name"]):
                summary["unverified"].append(
                    {"id": pid, "name": proj["name"], "reason": f"former_names lack {proj['name']}; skipped rename"}
                )
                continue
        src = f"https://www.ycombinator.com/companies/{info['slug']}"
        old = proj["name"]
        if normalize_name(old) != normalize_name(info["new_name"]):
            set_name(db, pid, info["new_name"], old, src)
            summary["wrong"]["company_name"] += 1
            log_prov(op="rename", project_id=pid, old=old, new=info["new_name"], source_url=src)
        if info.get("website"):
            set_website(db, pid, info["website"], src)
            db.execute(
                "UPDATE projects SET primary_link=?, primary_link_kind=? WHERE id=?",
                (src, "accelerator", pid),
            )
            log_prov(op="website_from_rename", project_id=pid, website=info["website"], source_url=src)

    # ---------- 2. Wrong rows ----------
    for r in rows:
        if r["status"] != "Wrong":
            continue
        pid = r["company_id"]
        field = r["field"]
        if pid in HOMONYM_SKIP_IDS:
            summary["skipped"].append(
                {"id": pid, "name": r["company_name"], "field": field, "reason": "homonym — keep Scout identity"}
            )
            continue
        if (pid, field) in SKIP_WRONG:
            summary["skipped"].append(
                {"id": pid, "name": r["company_name"], "field": field, "reason": "unverified / wrong YC target"}
            )
            continue
        proj = db.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        if not proj:
            summary["skipped"].append({"id": pid, "field": field, "reason": "missing project"})
            continue
        src = r["source_url"] or ""
        correct = (r["correct_value"] or "").strip()
        if not correct:
            summary["skipped"].append({"id": pid, "field": field, "reason": "empty correct_value"})
            continue

        if field == "company_name":
            # handled via RENAMES when applicable
            if pid in RENAMES:
                continue
            set_name(db, pid, correct, proj["name"], src)
            summary["wrong"]["company_name"] += 1
            log_prov(op="wrong_name", project_id=pid, value=correct, source_url=src)
        elif field == "founded_year":
            upsert_fact(db, pid, "founded_year", correct, src, r.get("note") or "audit wrong", ORIGIN)
            summary["wrong"]["founded_year"] += 1
            log_prov(op="wrong_year", project_id=pid, value=correct, source_url=src)
        elif field == "hq":
            upsert_fact(db, pid, "hq", correct, src, r.get("note") or "audit wrong", ORIGIN)
            summary["wrong"]["hq"] += 1
            log_prov(op="wrong_hq", project_id=pid, value=correct, source_url=src)
        elif field == "logo":
            st = http_status(correct)
            if st != 200:
                summary["skipped"].append(
                    {"id": pid, "field": "logo", "reason": f"correct logo HTTP {st}", "url": correct}
                )
                summary["unverified"].append({"id": pid, "field": "logo", "url": correct, "status": st})
                continue
            # replace favicon/logo facts
            db.execute(
                "DELETE FROM company_facts WHERE project_id=? AND fact_key IN ('logo','favicon','logo_url','favicon_url')",
                (pid,),
            )
            upsert_fact(db, pid, "favicon", correct, src, "YC thumb replaces dead s2", ORIGIN)
            summary["wrong"]["logo"] += 1
            log_prov(op="wrong_logo", project_id=pid, value=correct, source_url=src, http=st)
        elif field == "founders":
            names = [n.strip() for n in correct.split(",") if n.strip()]
            if not names:
                continue
            replace_founders(db, pid, names, src)
            summary["wrong"]["founders"] += 1
            log_prov(op="wrong_founders", project_id=pid, value=names, source_url=src)
        elif field == "campus":
            summary["skipped"].append(
                {"id": pid, "field": "campus", "reason": "campus Wrong skipped without LinkedIn corroboration"}
            )
            summary["unverified"].append({"id": pid, "field": "campus", "correct": correct, "source_url": src})
        elif field == "website":
            set_website(db, pid, correct, src)
            summary["wrong"]["website"] += 1
            log_prov(op="wrong_website", project_id=pid, value=correct, source_url=src)
        else:
            summary["skipped"].append({"id": pid, "field": field, "reason": "unhandled Wrong field"})

    # ---------- 3. Missing + Fill from CSV ----------
    for r in rows:
        if r["status"] not in ("Missing", "Fill"):
            continue
        pid = r["company_id"]
        field = r["field"]
        if pid in HOMONYM_SKIP_IDS:
            summary["skipped"].append(
                {"id": pid, "name": r["company_name"], "field": field, "status": r["status"], "reason": "homonym skip"}
            )
            continue
        # For Missing on rename targets that still cite old YC via host mismatch — allow if RENAMES applied
        correct = (r["correct_value"] or "").strip()
        src = r["source_url"] or ""
        if not correct and field != "logo":
            summary["skipped"].append({"id": pid, "field": field, "reason": "empty correct_value"})
            continue
        bucket = summary["missing"] if r["status"] == "Missing" else summary["fill"]

        if field == "sector":
            tag = map_sector(correct)
            if not tag:
                summary["skipped"].append({"id": pid, "field": "sector", "reason": f"unmapped sector {correct!r}"})
                continue
            # only fill if currently missing primary sector tag
            has = db.execute(
                "SELECT 1 FROM project_sector_tags WHERE project_id=? LIMIT 1", (pid,)
            ).fetchone()
            if has:
                bucket["sector_skipped_present"] += 1
                continue
            res = upsert_sector(db, pid, tag, src, f"audit {r['status']}: {correct}")
            if res in ("inserted", "updated"):
                bucket["sector"] += 1
                log_prov(op=f"{r['status'].lower()}_sector", project_id=pid, value=tag, raw=correct, source_url=src)
        elif field == "founded_year":
            has = db.execute(
                "SELECT 1 FROM company_facts WHERE project_id=? AND fact_key='founded_year' AND trim(value_text)!='' LIMIT 1",
                (pid,),
            ).fetchone()
            if has:
                bucket["year_skipped_present"] += 1
                continue
            upsert_fact(db, pid, "founded_year", correct, src, f"audit {r['status']}", ORIGIN)
            bucket["founded_year"] += 1
            log_prov(op=f"{r['status'].lower()}_year", project_id=pid, value=correct, source_url=src)
        elif field == "hq":
            has = db.execute(
                "SELECT 1 FROM company_facts WHERE project_id=? AND fact_key='hq' AND trim(value_text)!='' LIMIT 1",
                (pid,),
            ).fetchone()
            if has:
                bucket["hq_skipped_present"] += 1
                continue
            upsert_fact(db, pid, "hq", correct, src, f"audit {r['status']}", ORIGIN)
            bucket["hq"] += 1
            log_prov(op=f"{r['status'].lower()}_hq", project_id=pid, value=correct, source_url=src)
        elif field == "logo":
            url = correct
            if not url:
                continue
            st = http_status(url)
            if st != 200:
                summary["skipped"].append({"id": pid, "field": "logo", "reason": f"HTTP {st}", "url": url})
                continue
            has = db.execute(
                """SELECT value_text FROM company_facts WHERE project_id=?
                   AND fact_key IN ('logo','favicon','logo_url','favicon_url')
                   AND trim(value_text)!='' LIMIT 1""",
                (pid,),
            ).fetchone()
            if has and "bookface-images" in (has["value_text"] or ""):
                bucket["logo_skipped_present"] += 1
                continue
            if has and "s2/favicons" in (has["value_text"] or ""):
                # replace s2 with durable YC when filling
                db.execute(
                    "DELETE FROM company_facts WHERE project_id=? AND fact_key IN ('logo','favicon','logo_url','favicon_url')",
                    (pid,),
                )
            elif has:
                bucket["logo_skipped_present"] += 1
                continue
            upsert_fact(db, pid, "favicon", url, src, f"audit {r['status']} logo", ORIGIN)
            bucket["logo"] += 1
            log_prov(op=f"{r['status'].lower()}_logo", project_id=pid, value=url, source_url=src, http=st)
        elif field == "website":
            set_website(db, pid, correct, src)
            bucket["website"] += 1
            log_prov(op=f"{r['status'].lower()}_website", project_id=pid, value=correct, source_url=src)
        elif field in ("founders", "campus"):
            summary["skipped"].append(
                {"id": pid, "field": field, "status": r["status"], "reason": "CSV Missing founders/campus not auto-applied"}
            )
            summary["unverified"].append({"id": pid, "field": field, "value": correct, "source_url": src})
        else:
            summary["skipped"].append({"id": pid, "field": field, "reason": "unhandled Missing/Fill field"})

    # ---------- 4. Bulk YC fill for gaps ----------
    projects = db.execute(
        """SELECT id, name, website_url, primary_link FROM projects
           WHERE kind='company' AND is_investable_candidate=1"""
    ).fetchall()

    has_sector = {
        r["project_id"]
        for r in db.execute("SELECT DISTINCT project_id FROM project_sector_tags")
    }
    has_year = {
        r["project_id"]
        for r in db.execute(
            "SELECT DISTINCT project_id FROM company_facts WHERE fact_key='founded_year' AND trim(value_text)!=''"
        )
    }
    has_hq = {
        r["project_id"]
        for r in db.execute(
            "SELECT DISTINCT project_id FROM company_facts WHERE fact_key='hq' AND trim(value_text)!=''"
        )
    }
    has_logo = {
        r["project_id"]
        for r in db.execute(
            """SELECT DISTINCT project_id FROM company_facts
               WHERE fact_key IN ('logo','favicon','logo_url','favicon_url') AND trim(value_text)!=''"""
        )
    }

    # Build year from details by slug
    details_by_slug = {}
    for pid, d in details.items():
        if isinstance(d, dict) and d.get("slug"):
            details_by_slug[d["slug"]] = d

    matched = 0
    for proj in projects:
        if proj["id"] in HOMONYM_SKIP_IDS:
            continue
        yc = match_yc(proj, by_name, by_host)
        if not yc:
            continue
        matched += 1
        src = f"https://www.ycombinator.com/companies/{yc['slug']}"
        det = details_by_slug.get(yc["slug"]) or details.get(proj["id"])

        if proj["id"] not in has_sector:
            tag = yc_sector(yc)
            if tag:
                res = upsert_sector(db, proj["id"], tag, src, f"YC tags/industry → {tag}")
                if res in ("inserted", "updated"):
                    summary["bulk"]["sector"] += 1
                    has_sector.add(proj["id"])
                    log_prov(op="bulk_sector", project_id=proj["id"], value=tag, source_url=src, yc_slug=yc["slug"])

        if proj["id"] not in has_year:
            year = yc_year_from_details(det, yc)
            if year:
                upsert_fact(db, proj["id"], "founded_year", year, src, "YC year_founded", ORIGIN)
                summary["bulk"]["founded_year"] += 1
                has_year.add(proj["id"])
                log_prov(op="bulk_year", project_id=proj["id"], value=year, source_url=src, yc_slug=yc["slug"])

        if proj["id"] not in has_hq:
            hq = None
            if det and det.get("detail") and det["detail"].get("location"):
                hq = det["detail"]["location"]
            if not hq:
                hq = yc_hq(yc)
            if hq:
                upsert_fact(db, proj["id"], "hq", hq, src, "YC location", ORIGIN)
                summary["bulk"]["hq"] += 1
                has_hq.add(proj["id"])
                log_prov(op="bulk_hq", project_id=proj["id"], value=hq, source_url=src, yc_slug=yc["slug"])

        logo = yc.get("small_logo_thumb_url") or ""
        if logo and (proj["id"] not in has_logo or True):
            # Always prefer durable YC logo when current is dead s2 — handled in logo pass below
            if proj["id"] not in has_logo:
                st = http_status(logo)
                if st == 200:
                    upsert_fact(db, proj["id"], "favicon", logo, src, "YC small_logo_thumb_url", ORIGIN)
                    summary["bulk"]["logo"] += 1
                    has_logo.add(proj["id"])
                    log_prov(op="bulk_logo", project_id=proj["id"], value=logo, source_url=src, http=st)

    summary["bulk"]["yc_matched"] = matched

    # ---------- 5. Dead s2 logos → YC or drop ----------
    s2_rows = db.execute(
        """SELECT cf.id, cf.project_id, cf.value_text, p.name, p.website_url
           FROM company_facts cf
           JOIN projects p ON p.id=cf.project_id
           WHERE p.kind='company' AND p.is_investable_candidate=1
             AND cf.fact_key IN ('logo','favicon','logo_url','favicon_url')
             AND cf.value_text LIKE '%google.com/s2/favicons%'"""
    ).fetchall()
    for row in s2_rows:
        st = http_status(row["value_text"])
        if st == 200:
            summary["logos"]["s2_ok"] += 1
            continue
        summary["logos"]["s2_dead"] += 1
        # try YC match
        proj = db.execute(
            "SELECT id, name, website_url FROM projects WHERE id=?", (row["project_id"],)
        ).fetchone()
        yc = match_yc(proj, by_name, by_host) if proj and proj["id"] not in HOMONYM_SKIP_IDS else None
        replacement = None
        src = row["website_url"] or ""
        if yc and yc.get("small_logo_thumb_url"):
            replacement = yc["small_logo_thumb_url"]
            src = f"https://www.ycombinator.com/companies/{yc['slug']}"
        if replacement:
            rst = http_status(replacement)
            if rst == 200:
                db.execute("DELETE FROM company_facts WHERE id=?", (row["id"],))
                upsert_fact(db, row["project_id"], "favicon", replacement, src, "replace dead s2", ORIGIN)
                summary["logos"]["replaced"] += 1
                log_prov(op="logo_replace_dead_s2", project_id=row["project_id"], value=replacement, source_url=src)
                continue
        # clear dead URL rather than keep a 404
        db.execute("DELETE FROM company_facts WHERE id=?", (row["id"],))
        summary["logos"]["cleared_dead"] += 1
        log_prov(op="logo_clear_dead_s2", project_id=row["project_id"], old=row["value_text"], http=st)

    # Also apply Wrong-logo style replacements already done; check CSV Missing logos that are YC

    # ---------- 6. Website schema.org for remaining gaps (sample-capped for runtime) ----------
    need = db.execute(
        """SELECT p.id, p.name, p.website_url FROM projects p
           WHERE p.kind='company' AND p.is_investable_candidate=1
             AND p.website_url IS NOT NULL AND trim(p.website_url)!=''
             AND (
               p.id NOT IN (SELECT project_id FROM project_sector_tags)
               OR p.id NOT IN (SELECT project_id FROM company_facts WHERE fact_key='founded_year' AND trim(value_text)!='')
               OR p.id NOT IN (SELECT project_id FROM company_facts WHERE fact_key='hq' AND trim(value_text)!='')
             )
           ORDER BY p.name"""
    ).fetchall()
    # Cap network fetches to keep apply bounded; prefer companies missing year or hq
    schema_budget = 120
    fetched = 0
    for proj in need:
        if fetched >= schema_budget:
            summary["bulk"]["schema_budget_hit"] = schema_budget
            break
        if proj["id"] in HOMONYM_SKIP_IDS:
            continue
        url = proj["website_url"]
        html = fetch_text(url)
        fetched += 1
        if not html:
            summary["bulk"]["schema_fetch_fail"] += 1
            continue
        parsed = parse_schema_org(html)
        if not parsed:
            summary["bulk"]["schema_empty"] += 1
            continue
        if proj["id"] not in has_year and parsed.get("founded_year"):
            upsert_fact(
                db, proj["id"], "founded_year", parsed["founded_year"], url, "schema.org foundingDate", "company_site"
            )
            summary["bulk"]["schema_year"] += 1
            has_year.add(proj["id"])
            log_prov(op="schema_year", project_id=proj["id"], value=parsed["founded_year"], source_url=url)
        if proj["id"] not in has_hq and parsed.get("hq"):
            upsert_fact(db, proj["id"], "hq", parsed["hq"], url, "schema.org address", "company_site")
            summary["bulk"]["schema_hq"] += 1
            has_hq.add(proj["id"])
            log_prov(op="schema_hq", project_id=proj["id"], value=parsed["hq"], source_url=url)
        time.sleep(0.05)

    summary["bulk"]["schema_fetched"] = fetched

    db.commit()
    summary["after"] = coverage(db)
    summary["founders_after"] = db.execute(
        """SELECT COUNT(*) FROM person_project_roles ppr
           JOIN projects p ON p.id=ppr.project_id
           WHERE p.kind='company' AND p.is_investable_candidate=1 AND lower(ppr.role) LIKE '%founder%'"""
    ).fetchone()[0]
    summary["campuses_after"] = db.execute(
        "SELECT COUNT(*) FROM universities WHERE lat IS NOT NULL AND lon IS NOT NULL"
    ).fetchone()[0]

    # serialize counters
    def conv(obj):
        if isinstance(obj, Counter):
            return dict(obj)
        if isinstance(obj, dict):
            return {k: conv(v) for k, v in obj.items()}
        return obj

    SUMMARY_OUT.write_text(json.dumps(conv(summary), indent=2))
    prov.close()
    db.close()
    print(json.dumps(conv(summary), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
