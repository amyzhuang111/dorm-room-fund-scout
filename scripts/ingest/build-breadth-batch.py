#!/usr/bin/env python3
"""Build an idempotent campus-founder batch from public YC bios, Speedrun pages, and Contrary's Class of 2026.

Reads founder bios from https://devasheeshg.github.io/yc-api (a public mirror of
ycombinator.com company pages) for 2023–2026 batches. The stored source URL is
the Y Combinator company page, not the mirror. Speedrun introductions come from
each company's public page. Contrary names come from the Class of 2026 post.

Does not write emails. Skips people already in campus-universe.db.

    python3 scripts/ingest/build-breadth-batch.py data/imports/v3-campus-founders-batch8.json
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "campus-universe.db"
META = "https://devasheeshg.github.io/yc-api/meta.json"
CONTRARY = "https://contrary.com/blog/class-of-2026"
UA = "campus-universe-research-bot/0.1 (manual, bounded)"

SCHOOLS: list[tuple[str, str, str | None]] = [
    ("univ_penn", r"university of pennsylvania|\bupenn\b|\bwharton\b|\bpenn\b", r"penn state"),
    ("univ_berkeley", r"uc berkeley|u\.c\. berkeley|university of california,?\s+berkeley|berkeley eecs|haas|\bberkeley\b", r"lawrence berkeley|berkeley lab"),
    ("univ_columbia", r"columbia university|columbia college|columbia engineering|\bcolumbia\b", r"british columbia|district of columbia|columbia sportswear|columbia records|columbia pictures"),
    ("univ_stanford", r"\bstanford\b", r"stanford hospital|stanford medicine|stanford children's"),
    ("univ_mit", r"massachusetts institute of technology|(?<![A-Za-z])mit(?![A-Za-z])", r"mit technology review"),
    ("univ_harvard", r"\bharvard\b", r"harvard business review"),
    ("univ_princeton", r"\bprinceton\b", r"princeton review"),
    ("univ_cmu", r"carnegie mellon|(?<![A-Za-z])cmu(?![A-Za-z])", None),
    ("univ_gatech", r"georgia tech|georgia institute of technology", None),
    ("univ_michigan", r"university of michigan|\bumich\b|(?:at|from|@)\s+michigan\b", r"michigan state"),
    ("univ_yale", r"\byale\b", None),
    ("univ_nyu", r"(?<![A-Za-z])nyu(?![A-Za-z])|new york university", None),
    ("univ_cornell_tech", r"cornell tech", None),
    ("univ_cornell", r"\bcornell\b", r"cornell tech"),
    ("univ_uiuc", r"urbana-champaign|\buiuc\b|university of illinois", None),
    ("univ_utexas", r"university of texas at austin|ut austin|(?:at|from|@)\s+ut\b", r"ut dallas|ut health|ut southwestern"),
    ("univ_brown", r"brown university|(?:at|from|@)\s+brown\b", None),
    ("univ_duke", r"\bduke\b", r"duke energy|duke nukem"),
    ("univ_caltech", r"\bcaltech\b|california institute of technology", None),
    ("univ_ucla", r"\bucla\b", None),
    ("univ_usc", r"university of southern california|(?:at|from|@)\s+usc\b", None),
    ("univ_uchicago", r"university of chicago|\buchicago\b", None),
    ("univ_dartmouth", r"\bdartmouth\b", r"bridge program"),
    ("univ_waterloo", r"\bwaterloo\b", None),
    ("univ_rice", r"rice university|(?:at|from|@)\s+rice\b", None),
    ("univ_northwestern", r"northwestern", None),
    ("univ_georgetown", r"georgetown", None),
    ("univ_emory", r"emory university|(?:at|from|@)\s+emory\b", None),
    ("univ_unc", r"unc chapel hill|university of north carolina|(?:at|from|@)\s+unc\b", None),
    ("univ_vanderbilt", r"vanderbilt", None),
    ("univ_washu", r"washu|wustl|washington university in st", None),
    ("univ_notredame", r"notre dame", None),
    ("univ_uva", r"university of virginia|(?:at|from|@)\s+uva\b|(?<![A-Za-z])uva(?![A-Za-z])", None),
    ("univ_bu", r"boston university", None),
    ("univ_hmc", r"harvey mudd|\bhmc\b", None),
    ("univ_toronto", r"university of toronto|\buoft\b", None),
    ("univ_cambridge", r"university of cambridge|cambridge university", None),
    ("univ_uw", r"university of washington", None),
    ("univ_queens", r"queen'?s university", None),
]

COMPILED = [
    (sid, re.compile(pat, re.I), re.compile(ex, re.I) if ex else None) for sid, pat, ex in SCHOOLS
]
STRONG = re.compile(
    r"student|students|studied|studying|alumni|\balums?\b|graduated|undergrad|undergraduate|phd|ph\.d|class of|degree|mba|dropout|dropped out|majoring|bachelor|\bbs\b|\bba\b|\bms\b|on leave|freshm|sophomore|junior|senior",
    re.I,
)
EMPLOYMENT = re.compile(r"\b(professor|postdoc|faculty|worked at|employee|researcher at)\b", re.I)
CUSTOMER = re.compile(r"\b(customers?|used by|partnership with|hospitals?)\b", re.I)
OLD_BATCH = re.compile(r"\b[WSFX](0\d|1[0-7])\b")


def fetch(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", "replace")


def norm_person(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def norm_company(name: str) -> str:
    tokens = re.sub(r"[^a-z0-9]+", " ", name.lower()).split()
    legal = {"inc", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "gmbh", "pbc", "llp", "the"}
    kept = [t for t in tokens if t not in legal]
    return " ".join(kept or [t for t in tokens if t != "the"])


def class_year(text: str) -> int | None:
    text = text.replace("’", "'").replace("‘", "'")
    m = re.search(r"class of\s+(20\d{2})", text, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"'(\d{2})(?!\d)", text)
    if m:
        year = 2000 + int(m.group(1))
        if 1990 <= year <= 2032:
            return year
    m = re.search(r"(?:graduated|class of|bachelor(?:'s)?|degree).{0,48}\b(20\d{2})\b", text, re.I)
    if m:
        year = int(m.group(1))
        if 1990 <= year <= 2032:
            return year
    return None


def school_hit(text: str) -> tuple[str, str, bool] | None:
    best: tuple[str, str, bool] | None = None
    for sid, pat, ex in COMPILED:
        for m in pat.finditer(text):
            before = text[max(0, m.start() - 90) : m.start()]
            after = text[m.end() : m.end() + 48]
            local = re.sub(r"\s+", " ", f"{before}{m.group(0)}{after}").strip()
            if ex and ex.search(local):
                continue
            if re.search(r"scholarships?\s+from", before, re.I):
                continue
            if re.search(r"hackathon", local, re.I) and not STRONG.search(local):
                continue
            if CUSTOMER.search(local) and not STRONG.search(local):
                continue
            atfrom = bool(re.search(r"(?:at|from|@)\s*$", before[-22:], re.I))
            strong = bool(STRONG.search(local))
            tick = bool(re.search(r"^\s*'?\d{2}\b", after))
            if EMPLOYMENT.search(local) and not strong:
                continue
            if not (strong or atfrom or tick):
                continue
            if best is None or (strong and not best[2]):
                best = (sid, local[:200], strong)
            break
    return best


def recent_enough(bio: str) -> bool:
    year = class_year(bio)
    if year is not None and year < 2018:
        return False
    if year is not None and year >= 2018:
        return True
    if OLD_BATCH.search(bio) and not re.search(r"student|studying|on leave|dropout|dropped out", bio, re.I):
        return False
    return True


def enrollment(bio: str, evidence: str) -> dict | None:
    year = class_year(bio)
    if year is None:
        if re.search(r"\b(on leave|dropout|dropped out)\b", bio, re.I):
            return {
                "status": "current_student",
                "basis": "inferred",
                "label": "on leave" if re.search(r"on leave", bio, re.I) else "dropout",
                "gradYear": None,
                "evidence": evidence,
            }
        # "Senior Consultant" and "was a PhD student" are not current enrollment.
        scrubbed = re.sub(r"\bsenior\s+(consultant|engineer|software|applied|scientist|director|manager|associate)\b", " ", bio, flags=re.I)
        if re.search(r"\b(graduated|completed (?:my |a )?phd|was a phd student)\b", scrubbed, re.I) and not re.search(
            r"\b(studying|on leave|dropout|dropped out)\b", scrubbed, re.I
        ):
            return None
        if re.search(r"\b(student|studying|freshman|sophomore|junior|senior|undergrad)\b", scrubbed, re.I):
            label = "student"
            for word in ("freshman", "sophomore", "junior", "senior", "phd", "undergrad"):
                if re.search(word, scrubbed, re.I):
                    label = word
                    break
            return {
                "status": "current_student",
                "basis": "verified",
                "label": label,
                "gradYear": None,
                "evidence": evidence,
            }
        return None
    if year < 2018:
        return None
    status = "current_student" if year > 2026 else "recent_grad" if year >= 2023 else "older_alumni"
    return {
        "status": status,
        "basis": "verified",
        "label": f"'{str(year)[2:]}",
        "gradYear": year,
        "evidence": evidence,
    }


def left_school(bio: str) -> bool:
    return bool(re.search(r"\b(dropped out|dropout|on leave)\b", bio, re.I))


def load_known() -> set[str]:
    db = sqlite3.connect(DB)
    return {norm_person(n) for (n,) in db.execute("select name from people")}


def yc_companies(known: set[str]) -> list[dict]:
    meta = json.loads(fetch(META))
    keys = [k for k in meta["batches"] if any(y in k for y in ("2023", "2024", "2025", "2026"))]
    out: list[dict] = []
    for key in keys:
        rows = json.loads(fetch(meta["batches"][key]["api"]))
        for co in rows:
            if re.search(r"inactive|acquired|public|dead", co.get("status") or "", re.I):
                continue
            name = (co.get("name") or "").strip()
            if len(name) < 2 or not norm_company(name):
                continue
            batch = co.get("batch") or ""
            url = co.get("url") or ""
            if not url.startswith("https://www.ycombinator.com/companies/"):
                continue
            website = co.get("website") if isinstance(co.get("website"), str) and co["website"].startswith("http") else None
            one = (co.get("one_liner") or "").strip()
            founders = []
            campuses: list[str] = []
            for f in co.get("founders") or []:
                full = (f.get("full_name") or "").strip()
                if len(full.split()) < 2 or norm_person(full) in known:
                    continue
                bio = re.sub(r"\s+", " ", f.get("founder_bio") or "").strip()
                if not bio or not recent_enough(bio):
                    continue
                hit = school_hit(bio)
                if not hit:
                    continue
                sid, local, strong = hit
                title = (f.get("title") or "Founder").strip()
                display = name
                if name == "Nori" and website and "norirobotics" in website:
                    display = "Nori Robotics"
                excerpt = f"{full} ({title}). {bio}"[:700]
                note = (
                    f"Y Combinator lists {full} as a founder and the bio names the school. "
                    + ("A class year or student wording is printed." if strong else "The bio places them at the school without a class year.")
                )
                row = {
                    "name": full,
                    "aliases": [],
                    "campusId": sid,
                    "affiliationRole": f"Y Combinator {batch}, {sid}",
                    "founderStatus": "founder",
                    "potentialSignal": None,
                    "verificationStatus": "confirmed" if strong else "partial",
                    "verificationNote": note,
                    "excerpt": excerpt,
                }
                enr = enrollment(bio, f"The Y Combinator bio for {full} says: {local}")
                if enr:
                    row["enrollment"] = enr
                if left_school(bio):
                    row["leftSchool"] = True
                li = f.get("linkedin_url") or ""
                if isinstance(li, str) and "linkedin.com/in/" in li:
                    row["aliases"] = [f"linkedin:{li.split('?')[0]}"]
                founders.append(row)
                if sid not in campuses:
                    campuses.append(sid)
                known.add(norm_person(full))
            if not founders:
                continue
            # Keep the renamed Nori Robotics label if any founder bio forced it.
            if any("norirobotics" in (website or "") for _ in [0]) and name == "Nori":
                name = "Nori Robotics"
            company_excerpt = f"Y Combinator lists {name} ({batch}). {one} " + " ".join(f["excerpt"][:180] for f in founders)
            company_excerpt = company_excerpt[:1100]
            item = {
                "name": name,
                "description": one or None,
                "website": website,
                "sourceUrl": url,
                "excerpt": company_excerpt,
                "orgPlace": f"Y Combinator {batch}" if batch else "Y Combinator",
                "campusIds": campuses,
                "founders": founders,
                "investors": [
                    {
                        "name": "Y Combinator",
                        "excerpt": f"Y Combinator company page lists {name} in the {batch} batch. The page does not state a dollar amount.",
                        "sourceUrl": url,
                        "batch": batch or None,
                        "kind": "accelerator",
                    }
                ],
            }
            out.append(item)
    return out


def speedrun_slugs() -> list[str]:
    slugs: list[str] = []
    offset = 0
    while offset < 800:
        data = json.loads(fetch(f"https://speedrun-api.a16z.com/api/companies/companies/?limit=100&offset={offset}"))
        rows = data.get("results") or []
        slugs.extend(r["slug"] for r in rows if r.get("slug"))
        if len(rows) < 100:
            break
        offset += 100
    return slugs


def parse_speedrun(html: str) -> dict | None:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>', html)
    if not m:
        return None
    data = json.loads(m.group(1))
    queries = data.get("props", {}).get("pageProps", {}).get("dehydratedState", {}).get("queries") or []
    for q in queries:
        d = (q.get("state") or {}).get("data")
        if not isinstance(d, dict):
            continue
        founders = d.get("founder_set")
        if not isinstance(founders, list) or not founders:
            continue
        if not isinstance(founders[0], dict) or "introduction" not in founders[0]:
            continue
        return d
    return None


def speedrun_companies(known: set[str]) -> list[dict]:
    slugs = speedrun_slugs()
    print(f"speedrun slugs {len(slugs)}", flush=True)

    def one(slug: str) -> dict | None:
        url = f"https://speedrun.a16z.com/companies/{slug}"
        try:
            html = fetch(url, timeout=20)
        except Exception:
            return None
        return parse_speedrun(html)

    pages: list[dict] = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futs = [pool.submit(one, slug) for slug in slugs]
        for fut in as_completed(futs):
            row = fut.result()
            if row:
                pages.append(row)
    print(f"speedrun pages parsed {len(pages)}", flush=True)
    out = []
    for d in pages:
        name = str(d.get("name") or "").strip()
        slug = str(d.get("slug") or "")
        if len(name) < 2 or not slug:
            continue
        url = f"https://speedrun.a16z.com/companies/{slug}"
        website = d.get("website_url") if isinstance(d.get("website_url"), str) and str(d.get("website_url")).startswith("http") else None
        desc = re.sub(r"\s+", " ", str(d.get("preamble") or d.get("description") or "")).strip()[:400]
        founders = []
        campuses: list[str] = []
        for f in d.get("founder_set") or []:
            if not isinstance(f, dict):
                continue
            full = re.sub(r"\s+", " ", f"{f.get('first_name') or ''} {f.get('last_name') or ''}").strip()
            if len(full.split()) < 2 or norm_person(full) in known:
                continue
            bio = re.sub(r"\s+", " ", f.get("introduction") or "").strip()
            if not bio or not recent_enough(bio):
                continue
            hit = school_hit(bio)
            if not hit:
                continue
            sid, local, strong = hit
            title = (f.get("title") or "Founder").strip()
            excerpt = f"{full} ({title}). {bio}"[:700]
            row = {
                "name": full,
                "aliases": [],
                "campusId": sid,
                "affiliationRole": f"a16z Speedrun, {sid}",
                "founderStatus": "founder",
                "potentialSignal": None,
                "verificationStatus": "confirmed" if strong else "partial",
                "verificationNote": f"The Speedrun page lists {full} and the introduction names the school.",
                "excerpt": excerpt,
            }
            enr = enrollment(bio, f"The Speedrun introduction for {full} says: {local}")
            if enr:
                row["enrollment"] = enr
            if left_school(bio):
                row["leftSchool"] = True
            li = f.get("linkedin_url") or ""
            if isinstance(li, str) and "linkedin.com/in/" in li:
                row["aliases"] = [f"linkedin:{li.split('?')[0]}"]
            founders.append(row)
            if sid not in campuses:
                campuses.append(sid)
            known.add(norm_person(full))
        if not founders:
            continue
        excerpt = f"a16z Speedrun lists {name}. {desc} " + " ".join(f["excerpt"][:160] for f in founders)
        out.append(
            {
                "name": name,
                "description": desc or None,
                "website": website,
                "sourceUrl": url,
                "excerpt": excerpt[:1100],
                "orgPlace": "a16z Speedrun",
                "campusIds": campuses,
                "founders": founders,
                "investors": [
                    {
                        "name": "a16z Speedrun",
                        "excerpt": f"a16z Speedrun company page lists {name}. The page does not state a dollar amount.",
                        "sourceUrl": url,
                        "kind": "accelerator",
                    }
                ],
            }
        )
    return out


CONTRARY_SCHOOL = {
    "Waterloo": "univ_waterloo",
    "Dartmouth": "univ_dartmouth",
    "Georgia Tech": "univ_gatech",
    "Columbia": "univ_columbia",
    "Stanford": "univ_stanford",
    "Penn": "univ_penn",
    "Michigan": "univ_michigan",
    "Princeton": "univ_princeton",
    "Harvard": "univ_harvard",
    "MIT": "univ_mit",
    "Duke": "univ_duke",
    "Berkeley": "univ_berkeley",
}


def contrary_records(known: set[str]) -> tuple[list[dict], list[dict]]:
    html = fetch(CONTRARY)
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = text.replace("&#x27;", "'").replace("&#39;", "'").replace("&amp;", "&").replace("’", "'")
    text = re.sub(r"[ \t]+", " ", text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    companies: list[dict] = []
    potential: list[dict] = []
    i = 0
    while i < len(lines):
        m = re.match(r"^([A-Z][A-Za-z' .\-]+?) - ([A-Za-z ]+)$", lines[i])
        name = school = None
        if m and m.group(2) in CONTRARY_SCHOOL:
            name, school = m.group(1).strip(), m.group(2)
            i += 1
        elif i + 1 < len(lines) and lines[i + 1].startswith("Hey") and "Samuel Chen" in lines[i]:
            name, school = "Samuel Chen", "Stanford"
            i += 1
        else:
            i += 1
            continue
        bio_lines = []
        while i < len(lines) and not re.match(r"^[A-Z][A-Za-z' .\-]+? - [A-Za-z ]+$", lines[i]):
            if lines[i].startswith("Apply to") or lines[i].startswith("©"):
                break
            bio_lines.append(lines[i])
            i += 1
            if len(bio_lines) > 6:
                break
        bio = re.sub(r"\s+", " ", " ".join(bio_lines)).strip()
        if not name or norm_person(name) in known or len(name.split()) < 2:
            continue
        sid = CONTRARY_SCHOOL[school]
        known.add(norm_person(name))
        excerpt = f"{name}. {bio}"[:700]
        enr = enrollment(bio, f"Contrary's Class of 2026 page says: {bio[:240]}")
        if re.search(r"founded Arcafeed", bio, re.I):
            companies.append(
                {
                    "name": "Arcafeed",
                    "description": "AI agents for financial research.",
                    "website": None,
                    "sourceUrl": CONTRARY,
                    "excerpt": f"Dilzafer Singh, a first-year undergrad at Harvard, founded Arcafeed (AI agents for financial research).",
                    "orgPlace": "Contrary Class of 2026",
                    "campusIds": [sid],
                    "founders": [
                        {
                            "name": name,
                            "aliases": [],
                            "campusId": sid,
                            "affiliationRole": "Contrary Class of 2026, Harvard",
                            "founderStatus": "founder",
                            "potentialSignal": None,
                            "verificationStatus": "confirmed",
                            "verificationNote": "Contrary's Class of 2026 page says Dilzafer Singh is a first-year undergrad at Harvard and founded Arcafeed. No class year is printed.",
                            "enrollment": enr,
                            "excerpt": excerpt,
                        }
                    ],
                }
            )
            continue
        if re.search(r"cofounder and CEO .* at Red Leader", bio, re.I):
            companies.append(
                {
                    "name": "Red Leader",
                    "description": "A lidar company focused on digital signal processing to make self-driving cars safer.",
                    "website": None,
                    "sourceUrl": CONTRARY,
                    "excerpt": "Jake Hillard was cofounder and CEO at Red Leader, a lidar company focused on digital signal processing to make self-driving cars safer. He is a second year PhD student at Stanford.",
                    "orgPlace": "Contrary Class of 2026",
                    "campusIds": [sid],
                    "founders": [
                        {
                            "name": name,
                            "aliases": [],
                            "campusId": sid,
                            "affiliationRole": "Contrary Class of 2026, Stanford",
                            "founderStatus": "founder",
                            "potentialSignal": None,
                            "verificationStatus": "partial",
                            "verificationNote": "Contrary's Class of 2026 page says Jake Hillard was previously cofounder and CEO of Red Leader and is a second year PhD student at Stanford. No class year is printed.",
                            "enrollment": enr,
                            "excerpt": excerpt,
                        }
                    ],
                }
            )
            continue
        label = "student"
        for word in ("freshman", "sophomore", "junior", "senior", "first-year", "second year", "third-year", "undergrad", "PhD"):
            if re.search(word, bio, re.I):
                label = word
                break
        potential.append(
            {
                "name": name,
                "aliases": [],
                "campusId": sid,
                "affiliationRole": f"Contrary Class of 2026, {school}",
                "potentialSignal": "stealth or potential founder",
                "verificationStatus": "partial",
                "verificationNote": f"stealth or potential founder. Contrary's Class of 2026 page names {name} as a student Venture Partner at {school}. The page does not name a current company for them.",
                "orgPlace": "Contrary Class of 2026",
                "sourceUrl": CONTRARY,
                "excerpt": excerpt,
                "enrollment": enr,
                "leftSchool": bool(re.search(r"on leave|semester off", bio, re.I)),
            }
        )
    return companies, potential


def spot_check(companies: list[dict]) -> None:
    yc = [c for c in companies if "ycombinator.com/companies/" in c["sourceUrl"]]
    sample = yc[:: max(1, len(yc) // 5)][:5]
    ok = 0
    for co in sample:
        founder = co["founders"][0]["name"]
        try:
            html = fetch(co["sourceUrl"], timeout=20)
        except Exception as exc:
            print(f"spot miss {co['name']}: {exc}")
            continue
        if founder.lower() in html.lower():
            ok += 1
            print(f"spot ok {co['name']} / {founder}")
        else:
            print(f"spot FAIL {co['name']} / {founder} not on {co['sourceUrl']}")
    if ok < 4:
        raise SystemExit(f"YC spot check passed {ok}/5; refusing to write the batch")


def main() -> None:
    out_path = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "data/imports/v3-campus-founders-batch8.json")
    known = load_known()
    print(f"known people {len(known)}", flush=True)
    yc = yc_companies(known)
    print(f"yc companies {len(yc)} founders {sum(len(c['founders']) for c in yc)}", flush=True)
    speed = speedrun_companies(known)
    print(f"speedrun companies {len(speed)} founders {sum(len(c['founders']) for c in speed)}", flush=True)
    contrary_co, potential = contrary_records(known)
    print(f"contrary companies {len(contrary_co)} potential {len(potential)}", flush=True)
    companies = yc + speed + contrary_co
    spot_check(companies)
    payload = {
        "retrievedAt": "2026-09-27T22:00:00.000Z",
        "companies": companies,
        "potential": potential,
        "links": [],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"wrote {out_path} companies {len(companies)} potential {len(potential)}")


if __name__ == "__main__":
    main()
