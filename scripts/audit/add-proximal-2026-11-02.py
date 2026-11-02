#!/usr/bin/env python3
"""Add Proximal (proximal.ai) — coding-data research lab — if missing.

Disambiguation (do NOT mix these up):
  A) Proximal / proximal.ai / proximal.so / LinkedIn company proximalhq
     Founders: Calvin Chen, Justus Mattern, Navid Pour. AI coding-data lab. THIS ONE.
  B) Proximal / LinkedIn proximalllc — Andres Castrillon, sensor AI (different firm).
  C) Proximal Health / proximal.com — healthcare benefits (different firm).
  D) Proximal Labs — acquired/closed social-data firm (different).

Eligibility (Amy rule Nov 2026): include only if a founder is current student or
alum class of 2023+. Evidence:
  - Navid Pour: UofT Computer Engineering 2018–2023 → recent_grad 2023
    evidence: https://www.linkedin.com/in/navid-pour
  - Justus Mattern: RWTH Aachen Physics & CS, dropped out 2023 → recent_grad 2023
    evidence: https://www.justusmattern.com/ and LinkedIn
  - Calvin Chen: USC Business & CS, dropped out for YC; exact USC cohort year
    unverified on public LinkedIn education dates → enrollment_status unverified
    for cohort_year; still listed as founder. evidence: https://www.calvinchen.me/

Idempotent. Real public evidence only. No personal contact info.
"""
from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "campus-universe.db"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
SOURCE_ID = "src_manual_public_evidence"


def nid(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(9)}"


def ensure_source(cur: sqlite3.Cursor) -> None:
    cur.execute(
        """INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
           VALUES (?, 'Manual public evidence (scout-verified)', 'manual_referral', '(public web)', '[]', 1, 'manual', 'available', ?, ?)
           ON CONFLICT(id) DO NOTHING""",
        (SOURCE_ID, NOW, NOW),
    )


def ensure_rwth(cur: sqlite3.Cursor) -> str:
    uid = "univ_rwth_aachen"
    row = cur.execute("SELECT id FROM universities WHERE id=?", (uid,)).fetchone()
    if row:
        return uid
    # Coordinates: RWTH Aachen main campus (public Wikipedia/OSM)
    cur.execute(
        """INSERT INTO universities (id, name, aliases_json, country, lat, lon, coord_source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
        (
            uid,
            "RWTH Aachen University",
            json.dumps(["RWTH Aachen", "RWTH", "Rheinisch-Westfälische Technische Hochschule Aachen"]),
            "Germany",
            50.778,
            6.065,
            "en.wikipedia.org/wiki/RWTH_Aachen_University (approx main campus; added 2026-11-02 for Proximal founder affiliation)",
        ),
    )
    return uid


def already_present(cur: sqlite3.Cursor) -> str | None:
    row = cur.execute(
        """SELECT id FROM projects
           WHERE kind='company' AND (
             lower(name)='proximal'
             OR lower(COALESCE(website_url,'')) LIKE '%proximal.ai%'
             OR lower(COALESCE(website_url,'')) LIKE '%proximal.so%'
             OR lower(COALESCE(aliases_json,'')) LIKE '%proximalhq%'
           )"""
    ).fetchone()
    return row[0] if row else None


def insert_claim(cur, entity_type, entity_id, claim_type, value, excerpt, source_url, label, verification_state):
    cid = nid("claim")
    cur.execute(
        """INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            cid,
            entity_type,
            entity_id,
            claim_type,
            json.dumps(value),
            excerpt,
            SOURCE_ID,
            source_url,
            NOW,
            label,
            verification_state,
        ),
    )
    return cid


def insert_fact(cur, project_id, key, value_text, source_url, excerpt, origin="add_proximal_2026_11_02"):
    cur.execute(
        """INSERT INTO company_facts (id, project_id, fact_key, value_text, detail_json, source_url, excerpt, origin)
           VALUES (?,?,?,?, '{}', ?, ?, ?)""",
        (nid("cf"), project_id, key, value_text, source_url, excerpt, origin),
    )


def main() -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    ensure_source(cur)
    rwth = ensure_rwth(cur)

    existing = already_present(cur)
    if existing:
        print(json.dumps({"status": "already_present", "projectId": existing}))
        conn.close()
        return

    project_id = nid("proj")
    website = "https://www.proximal.ai/"
    description = (
        "Research lab focused on coding data and training infrastructure for "
        "autonomous / long-horizon coding agents (FrontierSWE benchmarks)."
    )
    cur.execute(
        """INSERT INTO projects (
             id, name, aliases_json, kind, sector, description, website_url,
             primary_link, primary_link_kind, is_portfolio_reference, is_investable_candidate,
             verification_status, last_verified_at, verification_note, signal_tier, signal_tier_basis
           ) VALUES (?,?,?,?,?,?,?,?,?,0,1,?,?,?,?,?)""",
        (
            project_id,
            "Proximal",
            json.dumps(["Proximal AI", "proximalhq", "proximal.so"]),
            "company",
            "AI / developer tools",
            description,
            website,
            website,
            "website",
            "verified",
            NOW,
            "Added 2026-11-02: proximal.ai coding-data lab (NOT Proximal Health, NOT proximalllc/Castrillon, NOT Proximal Labs).",
            "A",
            "public company site + founder pages; founders include class-of-2023 alumni",
        ),
    )

    insert_fact(cur, project_id, "website", website, website, "Company site")
    insert_fact(cur, project_id, "description", description, "https://www.proximal.ai/blog/proximal/", "Announcing Proximal (2026-06-23)")
    insert_fact(cur, project_id, "founded_year", "2025", "https://pitchbook.com/profiles/company/1239537-07", "PitchBook: founded 2025")
    insert_fact(
        cur,
        project_id,
        "recency_status",
        "verified_recent",
        "https://www.linkedin.com/in/navid-pour",
        "≥1 founder class of 2023+ (Navid Pour UofT 2023; Justus Mattern RWTH dropout 2023)",
    )
    insert_fact(
        cur,
        project_id,
        "same_name_disambiguation",
        "proximal.ai / proximalhq only",
        website,
        "Exclude Proximal Health (proximal.com), Andres Castrillon Proximal (proximalllc), Proximal Labs.",
    )

    # Company-level claim
    insert_claim(
        cur,
        "project",
        project_id,
        "company_identity",
        {
            "website": website,
            "also": ["https://www.proximal.so/"],
            "linkedin_company": "https://www.linkedin.com/company/proximalhq",
            "announce": "https://www.proximal.ai/blog/proximal/",
        },
        "Proximal (proximal.ai) is a research lab for coding data / autonomous coding agents. Announced 2026-06-23.",
        website,
        "observed_fact",
        "corroborated",
    )

    founders = [
        {
            "name": "Navid Pour",
            "university_id": "univ_toronto",
            "affiliation_type": "alum",
            "cohort_year": 2023,
            "enrollment_status": "recent_grad",
            "enrollment_label": "23",
            "left_school": 0,
            "role_aff": "Computer Engineering alum (2018–2023)",
            "aff_status": "recent_grad",
            "website_person": None,
            "evidence_url": "https://www.linkedin.com/in/navid-pour",
            "evidence_excerpt": (
                "LinkedIn education: Computer Engineering at University of Toronto, 2018–2023. "
                "Current role Co-Founder / CTO at Proximal (proximalhq)."
            ),
            "verified": True,
            "also_evidence": [
                "https://www.linkedin.com/posts/navid-pour_excited-to-finally-launch-proximal-with-justus-activity-7429982821890392065-fwFN"
            ],
        },
        {
            "name": "Justus Mattern",
            "university_id": rwth,
            "affiliation_type": "alum",
            "cohort_year": 2023,
            "enrollment_status": "recent_grad",
            "enrollment_label": "23",
            "left_school": 1,
            "role_aff": "Physics & CS; dropped out 2023",
            "aff_status": "recent_grad",
            "website_person": "https://www.justusmattern.com/",
            "evidence_url": "https://www.justusmattern.com/",
            "evidence_excerpt": (
                "Personal site: co-founder at Proximal; studied physics at RWTH Aachen but dropped out in 2023. "
                "LinkedIn lists Physics & CS at RWTH Aachen 2020–2023 (dropped out)."
            ),
            "verified": True,
            "also_evidence": ["https://www.linkedin.com/in/justus-mattern-a04230184"],
        },
        {
            "name": "Calvin Chen",
            "university_id": "univ_usc",
            "affiliation_type": "alum",
            "cohort_year": None,  # unverified
            "enrollment_status": "unverified",
            "enrollment_label": None,
            "left_school": 1,
            "role_aff": "Business & CS; dropped out for Y Combinator (exact USC cohort year unverified)",
            "aff_status": "unverified",
            "website_person": "https://www.calvinchen.me/",
            "evidence_url": "https://www.calvinchen.me/",
            "evidence_excerpt": (
                "Personal site: studied business and CS at USC before dropping out for Y Combinator; "
                "working on Proximal. LinkedIn lists USC dropout + YC W23 alumni, but no public USC end year."
            ),
            "verified": False,
            "also_evidence": ["https://www.linkedin.com/in/calvinjaychen"],
        },
    ]

    out_founders = []
    for f in founders:
        person_id = nid("person")
        evidence_json = json.dumps(
            {
                "university": f["university_id"],
                "affiliation_type": f["affiliation_type"],
                "cohort_year": f["cohort_year"] if f["cohort_year"] is not None else "unverified",
                "enrollment_status": f["enrollment_status"],
                "website": website,
                "evidence_url": f["evidence_url"],
                "person_website": f["website_person"],
                "basis": f["evidence_excerpt"],
                "checked_at": NOW,
            }
        )
        cur.execute(
            """INSERT INTO people (
                 id, name, aliases_json, enrollment_status, enrollment_label, enrollment_evidence,
                 enrollment_source_url, enrollment_grad_year, enrollment_basis, left_school,
                 founder_status, verification_status, last_verified_at, verification_note, signal_tier, signal_tier_basis
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                person_id,
                f["name"],
                "[]",
                f["enrollment_status"],
                f["enrollment_label"],
                evidence_json,
                f["evidence_url"],
                f["cohort_year"],
                "verified" if f["verified"] else "unverified",
                f["left_school"],
                "founder",
                "verified" if f["verified"] else "unverified",
                NOW,
                f"Proximal founder fields 2026-11-02; cohort_year={'verified '+str(f['cohort_year']) if f['cohort_year'] else 'unverified'}",
                "A" if f["verified"] else "C",
                "public LinkedIn / personal site",
            ),
        )

        claim_id = insert_claim(
            cur,
            "person",
            person_id,
            "affiliation",
            {
                "university": f["university_id"],
                "affiliation_type": f["affiliation_type"],
                "cohort_year": f["cohort_year"] if f["cohort_year"] is not None else "unverified",
                "enrollment_status": f["enrollment_status"],
                "website": website,
                "evidence_url": f["evidence_url"],
            },
            f["evidence_excerpt"],
            f["evidence_url"],
            "observed_fact" if f["verified"] else "analyst_inference",
            "corroborated" if f["verified"] else "unverified",
        )
        # Extra LinkedIn claim when personal site was primary
        for url in f.get("also_evidence") or []:
            insert_claim(
                cur,
                "person",
                person_id,
                "linkedin_profile",
                {"evidence_url": url, "company": "Proximal", "website": website},
                f"Public LinkedIn/profile corroboration for {f['name']} at Proximal.",
                url,
                "observed_fact",
                "corroborated" if f["verified"] else "unverified",
            )

        cur.execute(
            """INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id)
               VALUES (?,?,?,?,?,?)""",
            (nid("aff"), person_id, f["university_id"], f["role_aff"], f["aff_status"], claim_id),
        )
        cur.execute(
            """INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id)
               VALUES (?,?,?,?,?)""",
            (nid("ppr"), person_id, project_id, "founder", claim_id),
        )
        cur.execute(
            """INSERT INTO relationships (
                 id, source_entity_type, source_entity_id, target_entity_type, target_entity_id,
                 relationship_type, evidence_claim_ids_json, user_note, verification_state
               ) VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                nid("rel"),
                "person",
                person_id,
                "project",
                project_id,
                "founded",
                json.dumps([claim_id]),
                f["evidence_excerpt"][:280],
                "corroborated" if f["verified"] else "unverified",
            ),
        )

        # Scout note with Amy's required separate fields (no PII contact info)
        note_body = json.dumps(
            {
                "university": f["university_id"],
                "affiliation_type": f["affiliation_type"],
                "cohort_year": f["cohort_year"] if f["cohort_year"] is not None else "unverified",
                "enrollment_status": f["enrollment_status"],
                "website": website,
                "evidence_url": f["evidence_url"],
            },
            indent=2,
        )
        cur.execute(
            """INSERT INTO notes (id, entity_type, entity_id, body, author)
               VALUES (?,?,?,?,?)""",
            (nid("note"), "person", person_id, note_body, "add-proximal-2026-11-02"),
        )

        out_founders.append(
            {
                "personId": person_id,
                "name": f["name"],
                "university": f["university_id"],
                "affiliation_type": f["affiliation_type"],
                "cohort_year": f["cohort_year"] if f["cohort_year"] is not None else "unverified",
                "enrollment_status": f["enrollment_status"],
                "website": website,
                "evidence_url": f["evidence_url"],
            }
        )

    cur.execute(
        """INSERT INTO notes (id, entity_type, entity_id, body, author)
           VALUES (?,?,?,?,?)""",
        (
            nid("note"),
            "project",
            project_id,
            (
                "Proximal = proximal.ai coding-data lab (Chen/Mattern/Pour). "
                "Qualifies via Navid Pour (UofT CE 2023) and Justus Mattern (RWTH dropout 2023). "
                "Do not confuse with Proximal Health, proximalllc, or Proximal Labs."
            ),
            "add-proximal-2026-11-02",
        ),
    )

    # Gate: student affiliation pass
    cur.execute(
        """INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
           VALUES (?,?,?,?,?, datetime('now'))
           ON CONFLICT(project_id, gate_name) DO UPDATE SET
             result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at""",
        (
            nid("gate"),
            project_id,
            "student_affiliation",
            "pass",
            "Navid Pour recent_grad 2023 (UofT); Justus Mattern recent_grad/dropout 2023 (RWTH).",
        ),
    )

    conn.commit()
    print(
        json.dumps(
            {
                "status": "added",
                "projectId": project_id,
                "website": website,
                "qualifies": True,
                "why": "Navid Pour UofT CE class of 2023; Justus Mattern RWTH dropout 2023",
                "founders": out_founders,
                "rejected_same_name": [
                    {"name": "Proximal (proximalllc)", "url": "https://www.linkedin.com/company/proximalllc", "note": "Andres Castrillon sensor AI — different company"},
                    {"name": "Proximal Health", "url": "https://proximal.com/", "note": "Healthcare benefits — different company"},
                    {"name": "Proximal Labs", "url": "https://www.crunchbase.com/organization/proximal-labs", "note": "Acquired/closed — different company"},
                ],
            },
            indent=2,
        )
    )
    conn.close()


if __name__ == "__main__":
    main()
