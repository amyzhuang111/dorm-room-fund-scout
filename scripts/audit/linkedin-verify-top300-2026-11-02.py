#!/usr/bin/env python3
"""Verify LinkedIn URLs for founders of the top 300 investable companies.

Public sources only. Never invents a LinkedIn URL.
Stores aliases linkedin:URL only when verified.
Writes verification status claim: linkedin_verification = verified|unverified|conflict.
"""
from __future__ import annotations

import json
import re
import sqlite3
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "campus-universe.db"
QUEUE = Path("/workspace/reviews/campus-accuracy-audit-2026-11-02.json")
OUT = Path("/workspace/reviews/campus-linkedin-verify-2026-11-02.json")
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
UA = "CampusScoutAccuracyBot/1.0 (+public search verification; no login)"

LI_RE = re.compile(r"https?://(?:www\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+/?", re.I)


def aliases(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else []
    except Exception:
        return []


def linkedin_from_aliases(alist: list[str]) -> str | None:
    for a in alist:
        if isinstance(a, str) and a.startswith("linkedin:") and "linkedin.com/in/" in a:
            return a[len("linkedin:") :]
    return None


def set_linkedin_alias(alist: list[str], url: str | None) -> list[str]:
    out = [a for a in alist if not (isinstance(a, str) and a.startswith("linkedin:"))]
    # drop prior verification tags; re-add below
    out = [a for a in out if a not in {"linkedin_checked", "linkedin_verified", "linkedin_unverified", "linkedin_conflict"}]
    if url:
        out.append(f"linkedin:{url}")
        out.append("linkedin_verified")
    else:
        out.append("linkedin_unverified")
    return out


def duckduckgo_snippet(query: str) -> str:
    """Public HTML search snippet (no login). Best-effort; empty on failure."""
    url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode("utf-8", "ignore")
    except Exception:
        return ""
    # strip tags lightly
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text[:5000]


def company_mentioned(text: str, company: str) -> bool:
    if not text or not company:
        return False
    t = text.lower()
    name = company.lower().strip()
    if name in t:
        return True
    # token overlap for short brand names
    tokens = [w for w in re.findall(r"[a-z0-9]+", name) if len(w) > 2]
    return bool(tokens) and all(tok in t for tok in tokens[:2])


def main():
    log = json.loads(QUEUE.read_text()) if QUEUE.exists() else {}
    # rebuild top 300 from current investable
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    companies = list(
        cur.execute(
            """SELECT p.id, p.name, p.website_url,
                      (SELECT count(*) FROM signals s WHERE s.project_id=p.id) sigs
               FROM projects p
               WHERE p.kind='company' AND p.is_investable_candidate=1
               ORDER BY sigs DESC, p.name ASC LIMIT 300"""
        )
    )
    results = []
    counts = {"verified": 0, "unverified": 0, "conflict": 0, "founders": 0, "companies": len(companies)}

    for c in companies:
        founders = list(
            cur.execute(
                """SELECT pe.id, pe.name, pe.aliases_json, pe.enrollment_status, pe.enrollment_grad_year,
                          pe.enrollment_source_url, pe.verification_note
                   FROM person_project_roles ppr
                   JOIN people pe ON pe.id=ppr.person_id
                   WHERE ppr.project_id=? AND lower(ppr.role) LIKE '%founder%'""",
                (c["id"],),
            )
        )
        for f in founders:
            counts["founders"] += 1
            alist = aliases(f["aliases_json"])
            existing = linkedin_from_aliases(alist)
            # existing corroborated claim?
            claims = list(
                cur.execute(
                    """SELECT claim_type, value_json, source_url, verification_state, excerpt
                       FROM claims WHERE entity_type='person' AND entity_id=?
                         AND (claim_type LIKE '%linkedin%' OR lower(COALESCE(value_json,'')) LIKE '%linkedin.com/in/%'
                              OR lower(COALESCE(source_url,'')) LIKE '%linkedin.com/in/%')""",
                    (f["id"],),
                )
            )
            status = "unverified"
            url = None
            evidence = None
            note = ""

            # Prefer corroborated claim URL whose snippet names the company
            for cl in claims:
                blob = " ".join(
                    [
                        cl["value_json"] or "",
                        cl["excerpt"] or "",
                        cl["source_url"] or "",
                    ]
                )
                m = LI_RE.search(blob)
                if not m:
                    continue
                cand = m.group(0).rstrip("/")
                if cl["verification_state"] in {"corroborated", "verified"} and company_mentioned(blob, c["name"]):
                    status = "verified"
                    url = cand
                    evidence = cl["source_url"] or cand
                    note = "corroborated claim names company"
                    break
                if existing and cand.rstrip("/").lower() == existing.rstrip("/").lower() and company_mentioned(blob, c["name"]):
                    status = "verified"
                    url = cand
                    evidence = cl["source_url"] or cand
                    note = "alias matches claim; company named"
                    break

            # If still unverified but we have an alias, try public search snippet
            if status != "verified" and existing:
                q = f'"{f["name"]}" "{c["name"]}" site:linkedin.com/in'
                snippet = duckduckgo_snippet(q)
                found = LI_RE.findall(snippet)
                norm_existing = existing.rstrip("/").lower()
                if any(u.rstrip("/").lower() == norm_existing for u in found) and company_mentioned(snippet, c["name"]) and f["name"].split()[0].lower() in snippet.lower():
                    status = "verified"
                    url = existing.rstrip("/")
                    evidence = f"public search: {q}"
                    note = "search snippet lists same LinkedIn URL with company"
                elif found and not any(u.rstrip("/").lower() == norm_existing for u in found) and company_mentioned(snippet, c["name"]):
                    status = "conflict"
                    url = None
                    evidence = f"public search: {q}"
                    note = f"alias {existing} differs from search hits {found[:2]}"
                else:
                    status = "unverified"
                    url = None  # do not keep unverified URL as confirmed alias display? Amy: store only when verified
                    note = "existing alias not confirmed against public snippet"
            elif status != "verified" and not existing:
                # try to discover via public search — only store if unique and company+name match
                q = f'"{f["name"]}" "{c["name"]}" site:linkedin.com/in'
                snippet = duckduckgo_snippet(q)
                found = list(dict.fromkeys(u.rstrip("/") for u in LI_RE.findall(snippet)))
                if (
                    len(found) == 1
                    and company_mentioned(snippet, c["name"])
                    and f["name"].split()[0].lower() in snippet.lower()
                ):
                    status = "verified"
                    url = found[0]
                    evidence = f"public search: {q}"
                    note = "single LinkedIn hit names person and company"
                else:
                    status = "unverified"
                    url = None
                    note = "no verified public LinkedIn URL"

            counts[status] = counts.get(status, 0) + 1

            # Persist: only keep linkedin alias when verified
            new_aliases = set_linkedin_alias(alist, url if status == "verified" else None)
            if status == "conflict":
                new_aliases = [a for a in new_aliases if a != "linkedin_unverified"]
                new_aliases.append("linkedin_conflict")
            cur.execute(
                "UPDATE people SET aliases_json=?, last_verified_at=?, verification_note=? WHERE id=?",
                (
                    json.dumps(new_aliases),
                    NOW,
                    (f["verification_note"] or "")
                    and None
                    or None,
                    f["id"],
                ),
            )
            # fix verification_note properly
            prev = f["verification_note"] or ""
            marker = f"linkedin:{status}"
            if marker not in prev:
                prev = (prev + " | " if prev else "") + marker
            cur.execute("UPDATE people SET verification_note=? WHERE id=?", (prev, f["id"]))

            # claim row
            claim_id = f"claim_li_ver_{f['id'][:16]}"
            cur.execute("DELETE FROM claims WHERE id=?", (claim_id,))
            cur.execute(
                """INSERT INTO claims
                   (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id,
                    source_url, published_date, retrieved_at, label, verification_state, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    claim_id,
                    "person",
                    f["id"],
                    "linkedin_verification",
                    json.dumps({"status": status, "linkedin_url": url, "company_id": c["id"], "company": c["name"], "note": note}),
                    note,
                    None,
                    None,
                    evidence or "",
                    None,
                    NOW,
                    "observed_fact",
                    "corroborated" if status == "verified" else ("disputed" if status == "conflict" else "unverified"),
                    NOW,
                ),
            )

            results.append(
                {
                    "company": c["name"],
                    "company_id": c["id"],
                    "person": f["name"],
                    "person_id": f["id"],
                    "status": status,
                    "linkedin_url": url,
                    "note": note,
                }
            )

    con.commit()
    payload = {"generatedAt": NOW, "counts": counts, "results": results}
    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps(counts, indent=2))
    con.close()


if __name__ == "__main__":
    main()
