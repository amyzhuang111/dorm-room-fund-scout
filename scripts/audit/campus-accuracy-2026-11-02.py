#!/usr/bin/env python3
"""Campus Scout accuracy audit + fixes (2026-11-02).

Applies:
- Starcloud founder/status cleanup + recency exclusion
- Corpus contamination flags + confirmed fixes
- Founder recency rule (keep if any founder current/recent grad_year>=2023;
  exclude if all founders verified pre-2023 / faculty-staff only;
  else mark unverified recency)
- Writes JSON error/fix log for the markdown report

Real data only. Never invents LinkedIn URLs or grad years.
"""
from __future__ import annotations

import json
import re
import sqlite3
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "campus-universe.db"
OUT = Path("/workspace/reviews/campus-accuracy-audit-2026-11-02.json")
REPORT_MD = Path("/workspace/reviews/campus-accuracy-audit-2026-11-02.md")
AS_OF = 2026
RECENT_MIN = 2023
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def domain(url: str | None) -> str:
    if not url:
        return ""
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host

def ensure_schema(cur: sqlite3.Cursor) -> None:
    cols = {r[1] for r in cur.execute("PRAGMA table_info(projects)")}
    if "excluded_reason" not in cols:
        cur.execute("ALTER TABLE projects ADD COLUMN excluded_reason TEXT")
    # company-level recency verification marker
    # stored also in verification_note / company_facts

def audit_row(cur, entity_type, entity_id, action, field, old, new, reason, evidence_url=None, key=None):
    cur.execute(
        """INSERT INTO accuracy_audit
        (entity_type, entity_id, action, field, old_value, new_value, reason, evidence_url, checked_at, idempotency_key)
        VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            entity_type,
            entity_id,
            action,
            field,
            None if old is None else str(old),
            None if new is None else str(new),
            reason,
            evidence_url,
            NOW,
            key or f"{entity_type}:{entity_id}:{field}:{action}:{NOW}",
        ),
    )

def fix_starcloud(cur, log: dict) -> None:
    rows = list(
        cur.execute(
            """SELECT id, name, website_url, description, is_investable_candidate, verification_note, excluded_reason
               FROM projects WHERE lower(name) LIKE '%starcloud%' OR lower(COALESCE(website_url,'')) LIKE '%starcloud%'
                  OR lower(COALESCE(aliases_json,'')) LIKE '%starcloud%' OR lower(name) LIKE '%lumen orbit%'"""
        )
    )
    log["starcloud"] = {
        "records_found": [dict(r) for r in rows],
        "interpretation": (
            "Public sources (YC, starcloud.com, GeekWire) show ONE company: "
            "YC S24 Starcloud, formerly Lumen Orbit, founders Philip Johnston, Ezra Feilden, Adi Oltean. "
            "No second Starcloud company exists in either branch DB."
        ),
        "fixes": [],
    }
    if not rows:
        log["starcloud"]["error"] = "no Starcloud records"
        return
    # Keep the YC starcloud.com record; drop any non-matching same-name if present
    primary = None
    for r in rows:
        if domain(r["website_url"]) in {"starcloud.com", "www.starcloud.com"} or (r["website_url"] or "").rstrip("/").endswith("starcloud.com"):
            primary = r
            break
    if primary is None:
        primary = rows[0]

    # Fix founders
    founder_fixes = [
        {
            "id": "person_OzD9Og2zXj11",
            "name": "Philip Johnston",
            "status": "older_alumni",
            "grad_year": None,
            "basis": "verified",
            "evidence": (
                "YC/company bio: MPA Harvard, MBA Wharton, MA Columbia; former McKinsey; second-time founder. "
                "No undergrad class year 2023+."
            ),
            "url": "https://www.starcloud.com/",
            "school_ok": "univ_penn",  # Wharton / Penn — keep affiliation
        },
        {
            "id": "person_qp0LOFWhNEE_",
            "name": "Ezra Feilden",
            "status": "older_alumni",
            "grad_year": None,
            "basis": "verified",
            "evidence": (
                "Company/YC bio: PhD Materials Engineering Imperial College London; decade at Airbus/Oxford Space Systems. "
                "Was incorrectly marked recent_grad from company founding year 2024."
            ),
            "url": "https://www.ycombinator.com/companies/starcloud",
            "school_ok": None,
        },
        {
            "id": "person_2NbIBk3_BAWn",
            "name": "Adi Oltean",
            "status": "older_alumni",
            "grad_year": None,
            "basis": "verified",
            "evidence": (
                "Company/YC bio: Principal SWE at SpaceX Starlink; ~20 years at Microsoft; degrees University of Bucharest. "
                "Was incorrectly marked recent_grad from company founding year 2024."
            ),
            "url": "https://www.ycombinator.com/companies/starcloud",
            "school_ok": None,
        },
    ]
    for f in founder_fixes:
        row = cur.execute("SELECT * FROM people WHERE id=?", (f["id"],)).fetchone()
        if not row:
            continue
        old = (row["enrollment_status"], row["enrollment_grad_year"], row["enrollment_basis"], row["enrollment_evidence"])
        cur.execute(
            """UPDATE people SET enrollment_status=?, enrollment_label=NULL, enrollment_grad_year=?,
               enrollment_basis=?, enrollment_evidence=?, enrollment_source_url=?,
               verification_status='confirmed', last_verified_at=?, verification_note=?
               WHERE id=?""",
            (
                f["status"],
                f["grad_year"],
                f["basis"],
                f["evidence"],
                f["url"],
                NOW,
                "Starcloud founder recency corrected 2026-11-02",
                f["id"],
            ),
        )
        audit_row(
            cur,
            "person",
            f["id"],
            "fix",
            "enrollment_status",
            old[0],
            f["status"],
            f["evidence"],
            f["url"],
            f"starcloud-enroll-{f['id']}",
        )
        log["starcloud"]["fixes"].append({"person": f["name"], "old": old[0], "new": f["status"]})

    # Exclude company under recency rule
    reason = "founders not current/recent (<2023)"
    old_inv = primary["is_investable_candidate"]
    cur.execute(
        """UPDATE projects SET is_investable_candidate=0, excluded_reason=?,
           verification_note=?, last_verified_at=?, verification_status='confirmed', updated_at=?
           WHERE id=?""",
        (
            reason,
            "Excluded 2026-11-02: all founders verified as older alumni (not class of 2023+ / current students).",
            NOW,
            NOW,
            primary["id"],
        ),
    )
    audit_row(
        cur,
        "project",
        primary["id"],
        "exclude",
        "is_investable_candidate",
        old_inv,
        0,
        reason,
        "https://www.starcloud.com/",
        "starcloud-exclude",
    )
    log["starcloud"]["fixes"].append({"project": primary["name"], "excluded_reason": reason})

    # Drop non-primary same-name if any
    for r in rows:
        if r["id"] == primary["id"]:
            continue
        cur.execute(
            """UPDATE projects SET is_investable_candidate=0, excluded_reason=?,
               verification_note=?, updated_at=? WHERE id=?""",
            (
                "duplicate_or_wrong_starcloud",
                f"Non-primary Starcloud-like record; survivor {primary['id']}",
                NOW,
                r["id"],
            ),
        )
        log["starcloud"]["fixes"].append({"dropped_extra": dict(r)})


def name_tokens(name: str) -> set[str]:
    stop = {"the", "a", "an", "and", "of", "for", "inc", "llc", "ltd", "co", "company", "ai", "io"}
    parts = re.findall(r"[a-z0-9]+", (name or "").lower())
    return {p for p in parts if p not in stop and len(p) > 1}


def contamination_audit(cur, log: dict) -> list[dict]:
    errors: list[dict] = []

    # 1) Same/similar names, different domains
    by_name: dict[str, list] = defaultdict(list)
    for r in cur.execute(
        "SELECT id, name, website_url, description, is_investable_candidate FROM projects WHERE kind='company'"
    ):
        by_name[(r["name"] or "").strip().lower()].append(r)
    for name, group in by_name.items():
        if len(group) < 2 or not name:
            continue
        domains = {domain(g["website_url"]) for g in group if domain(g["website_url"])}
        if len(domains) >= 2:
            errors.append(
                {
                    "type": "same_name_different_domains",
                    "name": name,
                    "ids": [g["id"] for g in group],
                    "domains": sorted(domains),
                    "action": "flag_keep_separate",
                }
            )

    # 2) Website domain vs name (heuristic)
    for r in cur.execute(
        """SELECT id, name, website_url, description FROM projects
           WHERE kind='company' AND is_investable_candidate=1 AND website_url IS NOT NULL"""
    ):
        d = domain(r["website_url"])
        tokens = name_tokens(r["name"])
        if not d or not tokens:
            continue
        # skip if any token appears in domain or description strongly tied
        if any(t in d.replace("-", "") or t in d for t in tokens):
            continue
        # common brand mismatch patterns only when description mentions another brand domain
        desc = (r["description"] or "").lower()
        # soft flag only
        if tokens and d and not any(t[:4] in d for t in tokens if len(t) >= 4):
            # ignore very generic short names
            if max(len(t) for t in tokens) >= 5:
                errors.append(
                    {
                        "type": "website_name_mismatch_soft",
                        "id": r["id"],
                        "name": r["name"],
                        "domain": d,
                        "action": "flag",
                    }
                )

    # 3) Founders attached to multiple unrelated companies
    for r in cur.execute(
        """SELECT pe.id person_id, pe.name, group_concat(pr.id) pids, group_concat(pr.name) names,
                  group_concat(COALESCE(pr.website_url,'')) sites, count(DISTINCT pr.id) n
           FROM people pe
           JOIN person_project_roles ppr ON ppr.person_id=pe.id AND lower(ppr.role) LIKE '%founder%'
           JOIN projects pr ON pr.id=ppr.project_id AND pr.kind='company'
           GROUP BY pe.id HAVING n > 1"""
    ):
        sites = [domain(s) for s in (r["sites"] or "").split(",") if domain(s)]
        uniq_sites = {s for s in sites if s}
        names = (r["names"] or "").split(",")
        # unrelated if >1 distinct non-empty domains OR clearly different names
        if len(uniq_sites) > 1 or len(set(n.strip().lower() for n in names)) > 1:
            errors.append(
                {
                    "type": "founder_multi_company",
                    "person_id": r["person_id"],
                    "person": r["name"],
                    "companies": names,
                    "ids": (r["pids"] or "").split(","),
                    "domains": sorted(uniq_sites),
                    "action": "flag_review",
                }
            )

    # 4) Duplicate descriptions across different companies
    desc_map: dict[str, list] = defaultdict(list)
    for r in cur.execute(
        """SELECT id, name, description, website_url FROM projects
           WHERE kind='company' AND description IS NOT NULL AND length(trim(description)) > 40"""
    ):
        key = re.sub(r"\s+", " ", r["description"].strip().lower())
        desc_map[key].append(r)
    for key, group in desc_map.items():
        if len(group) < 2:
            continue
        ids = [g["id"] for g in group]
        if len(set(ids)) < 2:
            continue
        errors.append(
            {
                "type": "copied_description",
                "ids": ids,
                "names": [g["name"] for g in group],
                "description": key[:160],
                "action": "flag",
            }
        )

    # 5) Logo/favicon domain differs from website (ignore google favicon helper + bookface CDN soft)
    for r in cur.execute(
        """SELECT p.id, p.name, p.website_url, f.value_text fav
           FROM projects p
           JOIN company_facts f ON f.project_id=p.id AND f.fact_key='favicon'
           WHERE p.kind='company' AND p.is_investable_candidate=1"""
    ):
        site = domain(r["website_url"])
        fav = r["fav"] or ""
        m = re.search(r"domain=([^&]+)", fav)
        favd = (m.group(1) if m else domain(fav)).lower()
        if favd.startswith("www."):
            favd = favd[4:]
        if not site or not favd:
            continue
        if "bookface-images.s3.amazonaws.com" in favd:
            continue  # YC CDN logos — expected
        if site in favd or favd in site:
            continue
        # google s2 favicon with different domain
        if "google.com" in (domain(fav) or fav) and m and site not in favd and favd not in site:
            errors.append(
                {
                    "type": "logo_domain_mismatch",
                    "id": r["id"],
                    "name": r["name"],
                    "website_domain": site,
                    "logo_domain": favd,
                    "action": "flag",
                }
            )

    # 6) Campus/school affiliation with no evidence_url
    for r in cur.execute(
        """SELECT a.id aff_id, pe.id person_id, pe.name person, u.name school, a.role, a.status, a.claim_id,
                  c.source_url claim_url, pe.enrollment_source_url
           FROM affiliations a
           JOIN people pe ON pe.id=a.person_id
           LEFT JOIN universities u ON u.id=a.university_id
           LEFT JOIN claims c ON c.id=a.claim_id
           WHERE (c.source_url IS NULL OR trim(c.source_url)='')
             AND (pe.enrollment_source_url IS NULL OR trim(pe.enrollment_source_url)='')"""
    ):
        errors.append(
            {
                "type": "campus_without_evidence_url",
                "affiliation_id": r["aff_id"],
                "person": r["person"],
                "school": r["school"],
                "action": "flag",
            }
        )

    log["contamination_errors"] = errors
    return errors


def apply_confirmed_contamination_fixes(cur, errors: list[dict], log: dict) -> dict:
    """Only auto-fix high-confidence cases; leave soft flags alone."""
    fixed = defaultdict(int)

    # For same-name different domains: ensure both stay separate (no merge). Clear crossed YC facts if one lacks YC claim.
    # Copied descriptions: clear description on non-primary (keep the one with website match / longer history)
    for err in errors:
        if err["type"] == "copied_description" and len(err["ids"]) >= 2:
            # keep first with website, clear others if identical and names differ
            rows = [
                cur.execute(
                    "SELECT id, name, website_url, description FROM projects WHERE id=?", (i,)
                ).fetchone()
                for i in err["ids"]
            ]
            rows = [r for r in rows if r]
            if len({(r["name"] or "").lower() for r in rows}) < 2:
                continue  # same name duplicates handled elsewhere
            keeper = next((r for r in rows if r["website_url"]), rows[0])
            for r in rows:
                if r["id"] == keeper["id"]:
                    continue
                if (r["description"] or "").strip().lower() == (keeper["description"] or "").strip().lower():
                    cur.execute(
                        "UPDATE projects SET description=NULL, updated_at=? WHERE id=?",
                        (NOW, r["id"]),
                    )
                    audit_row(
                        cur,
                        "project",
                        r["id"],
                        "fix",
                        "description",
                        keeper["description"][:120] if keeper["description"] else None,
                        None,
                        f"Cleared description copied from {keeper['name']} ({keeper['id']})",
                        None,
                        f"copied-desc-{r['id']}",
                    )
                    fixed["copied_description"] += 1

        if err["type"] == "logo_domain_mismatch":
            # remove mismatched favicon fact
            cur.execute(
                "DELETE FROM company_facts WHERE project_id=? AND fact_key='favicon'",
                (err["id"],),
            )
            # re-add favicon from own website domain when available
            site = err.get("website_domain")
            if site:
                fav = f"https://www.google.com/s2/favicons?domain={site}&sz=128"
                cur.execute(
                    """INSERT INTO company_facts (project_id, fact_key, value_text, excerpt, source_url, origin, created_at)
                       VALUES (?,?,?,?,?,?,?)""",
                    (err["id"], "favicon", fav, "", f"https://{site}/", "accuracy_audit_2026_11_02", NOW),
                )
            audit_row(
                cur,
                "project",
                err["id"],
                "fix",
                "favicon",
                err.get("logo_domain"),
                site,
                "Logo/favicon domain did not match website; reset to website domain",
                None,
                f"logo-{err['id']}",
            )
            fixed["logo_domain_mismatch"] += 1

    log["contamination_fixes"] = dict(fixed)
    return dict(fixed)


def company_recency(cur, project_id: str) -> tuple[str, str | None]:
    """Return (bucket, detail) where bucket in keep|exclude|unverified."""
    founders = list(
        cur.execute(
            """SELECT pe.id, pe.name, pe.enrollment_status, pe.enrollment_grad_year, pe.enrollment_basis,
                      pe.enrollment_source_url, pe.founder_status, ppr.role
               FROM person_project_roles ppr
               JOIN people pe ON pe.id=ppr.person_id
               WHERE ppr.project_id=? AND (lower(ppr.role) LIKE '%founder%' OR pe.founder_status='founder')""",
            (project_id,),
        )
    )
    if not founders:
        return "unverified", "no founders on record"

    def is_recent(f) -> bool | None:
        """True=recent, False=confirmed old, None=unknown."""
        role = (f["role"] or "").lower()
        if "faculty" in role or "staff" in role or "advisor" in role:
            return False
        gy = f["enrollment_grad_year"]
        basis = (f["enrollment_basis"] or "").lower()
        status = f["enrollment_status"]
        if gy is not None:
            if gy >= RECENT_MIN:
                return True
            if basis in {"verified", "stated", "corroborated"} or status == "older_alumni":
                return False
            # year present but weak basis — still trust numeric year
            return False if gy < RECENT_MIN else True
        if status == "current_student":
            return True
        if status == "recent_grad":
            # Site bucket already means class year in 2023–2026 window when classified.
            # Keep as qualifying, but callers still store evidence_url when present.
            return True
        if status == "older_alumni":
            return False
        return None

    flags = [is_recent(f) for f in founders]
    if any(x is True for x in flags):
        return "keep", "has current/recent founder"
    if flags and all(x is False for x in flags):
        return "exclude", "founders not current/recent (<2023)"
    return "unverified", "unverified recency"


def apply_recency_rule(cur, log: dict) -> dict:
    stats = {"kept": 0, "excluded": 0, "unverified": 0, "total": 0}
    samples = {"excluded": [], "unverified": [], "kept": []}
    rows = list(
        cur.execute(
            "SELECT id, name, is_investable_candidate, excluded_reason, verification_note FROM projects WHERE kind='company'"
        )
    )
    for r in rows:
        stats["total"] += 1
        bucket, detail = company_recency(cur, r["id"])
        if bucket == "keep":
            stats["kept"] += 1
            # clear prior exclusion if re-qualifies
            if r["is_investable_candidate"] == 0 and (r["excluded_reason"] or "").startswith("founders not current"):
                cur.execute(
                    "UPDATE projects SET is_investable_candidate=1, excluded_reason=NULL, updated_at=? WHERE id=?",
                    (NOW, r["id"]),
                )
            if len(samples["kept"]) < 5:
                samples["kept"].append(r["name"])
        elif bucket == "exclude":
            stats["excluded"] += 1
            cur.execute(
                """UPDATE projects SET is_investable_candidate=0, excluded_reason=?,
                   verification_note=?, updated_at=? WHERE id=?""",
                (
                    "founders not current/recent (<2023)",
                    detail,
                    NOW,
                    r["id"],
                ),
            )
            # store fact
            cur.execute("DELETE FROM company_facts WHERE project_id=? AND fact_key='recency_status'", (r["id"],))
            cur.execute(
                """INSERT INTO company_facts (project_id, fact_key, value_text, excerpt, source_url, origin, created_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (r["id"], "recency_status", "excluded_pre_2023", "", "", "accuracy_audit_2026_11_02", NOW),
            )
            if len(samples["excluded"]) < 15:
                samples["excluded"].append(r["name"])
        else:
            stats["unverified"] += 1
            # Mark unverified recency; do NOT treat as verified recent.
            # Keep investable only if currently investable AND not already excluded for other reasons;
            # Amy: don't silently keep as verified — set verification markers.
            note = "unverified recency"
            cur.execute(
                """UPDATE projects SET verification_note=CASE
                     WHEN verification_note IS NULL OR verification_note='' THEN ?
                     WHEN verification_note LIKE '%unverified recency%' THEN verification_note
                     ELSE verification_note || ' | ' || ?
                   END,
                   verification_status=CASE WHEN verification_status='confirmed' THEN 'needs_verification' ELSE COALESCE(verification_status,'needs_verification') END,
                   updated_at=?
                   WHERE id=?""",
                (note, note, NOW, r["id"]),
            )
            cur.execute("DELETE FROM company_facts WHERE project_id=? AND fact_key='recency_status'", (r["id"],))
            cur.execute(
                """INSERT INTO company_facts (project_id, fact_key, value_text, excerpt, source_url, origin, created_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (r["id"], "recency_status", "unverified_recency", "", "", "accuracy_audit_2026_11_02", NOW),
            )
            # Mark unverified recency without inventing eligibility. Keep off the main
            # investable list until a founder is verified current/recent (Amy: do not
            # silently keep them as verified).
            cur.execute(
                """UPDATE projects SET is_investable_candidate=0,
                   excluded_reason='unverified recency',
                   updated_at=? WHERE id=?""",
                (NOW, r["id"]),
            )
            if len(samples["unverified"]) < 15:
                samples["unverified"].append(r["name"])

    # final investable count
    stats["investable_after"] = cur.execute(
        "SELECT count(*) FROM projects WHERE kind='company' AND is_investable_candidate=1"
    ).fetchone()[0]
    stats["companies_total"] = cur.execute(
        "SELECT count(*) FROM projects WHERE kind='company'"
    ).fetchone()[0]
    stats["samples"] = samples
    log["recency"] = stats
    return stats


def top_visible_companies(cur, limit=300) -> list[dict]:
    # Prefer companies with signals, then name
    rows = list(
        cur.execute(
            """SELECT p.id, p.name, p.website_url,
                      (SELECT count(*) FROM signals s WHERE s.project_id=p.id) sigs,
                      (SELECT count(*) FROM news_mentions nm WHERE nm.project_id=p.id) news
               FROM projects p
               WHERE p.kind='company' AND p.is_investable_candidate=1
               ORDER BY (sigs+news) DESC, p.name ASC
               LIMIT ?""",
            (limit,),
        )
    )
    if len(rows) < limit:
        # fill with remaining investable
        have = {r["id"] for r in rows}
        for r in cur.execute(
            """SELECT id, name, website_url, 0 sigs, 0 news FROM projects
               WHERE kind='company' AND is_investable_candidate=1 ORDER BY name"""
        ):
            if r["id"] in have:
                continue
            rows.append(r)
            if len(rows) >= limit:
                break
    return [dict(r) for r in rows]


def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    ensure_schema(cur)
    log: dict = {"started_at": NOW, "db": str(DB), "branch_tip_expected": "1083e30 / 322611b"}

    before = {
        "companies": cur.execute("SELECT count(*) FROM projects WHERE kind='company'").fetchone()[0],
        "investable": cur.execute(
            "SELECT count(*) FROM projects WHERE kind='company' AND is_investable_candidate=1"
        ).fetchone()[0],
    }
    log["before"] = before

    fix_starcloud(cur, log)
    errors = contamination_audit(cur, log)
    # Cap soft website mismatches in report (too noisy)
    soft = [e for e in errors if e["type"] == "website_name_mismatch_soft"]
    hard = [e for e in errors if e["type"] != "website_name_mismatch_soft"]
    log["contamination_errors"] = hard
    log["contamination_soft_website_mismatch_count"] = len(soft)
    fixes = apply_confirmed_contamination_fixes(cur, hard, log)
    recency = apply_recency_rule(cur, log)

    after = {
        "companies": cur.execute("SELECT count(*) FROM projects WHERE kind='company'").fetchone()[0],
        "investable": cur.execute(
            "SELECT count(*) FROM projects WHERE kind='company' AND is_investable_candidate=1"
        ).fetchone()[0],
        "excluded_reason_counts": dict(
            cur.execute(
                """SELECT COALESCE(excluded_reason,'(null)'), count(*) FROM projects
                   WHERE kind='company' GROUP BY 1 ORDER BY 2 DESC"""
            ).fetchall()
        ),
    }
    log["after"] = after
    log["error_counts_by_type"] = {}
    for e in hard:
        log["error_counts_by_type"][e["type"]] = log["error_counts_by_type"].get(e["type"], 0) + 1

    # top companies for LinkedIn pass (IDs only — LinkedIn filled by separate step)
    top = top_visible_companies(cur, 300)
    log["linkedin_queue"] = [
        {
            "company_id": c["id"],
            "company": c["name"],
            "website": c.get("website_url"),
            "founders": [
                dict(f)
                for f in cur.execute(
                    """SELECT pe.id, pe.name,
                              (SELECT substr(value_json,1,300) FROM claims
                               WHERE entity_type='person' AND entity_id=pe.id AND claim_type LIKE '%linkedin%'
                               LIMIT 1) existing_claim
                       FROM person_project_roles ppr
                       JOIN people pe ON pe.id=ppr.person_id
                       WHERE ppr.project_id=? AND lower(ppr.role) LIKE '%founder%'""",
                    (c["id"],),
                )
            ],
        }
        for c in top
    ]

    con.commit()
    OUT.write_text(json.dumps(log, indent=2, default=str))
    print(json.dumps({"before": before, "after": after, "recency": recency, "fixes": fixes, "out": str(OUT)}, indent=2))
    con.close()


if __name__ == "__main__":
    main()
