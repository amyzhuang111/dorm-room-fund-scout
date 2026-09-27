#!/usr/bin/env python3
"""Audit startup and founder rows against public pages.

Reads data/campus-universe.db. Fetches YC company pages and startup websites,
compares them to stored name, website, description, founding year, founders,
and profile links, and writes a report. Does not modify the database.

  python3 scripts/audit/verify-founders-startups.py
  python3 scripts/audit/verify-founders-startups.py --limit-sites 50

Cache lives in /tmp/audit/cache so a second run skips pages already fetched.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sqlite3
import ssl
import time
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "campus-universe.db"
CACHE = Path("/tmp/audit/cache")
YC_JSON = Path("/tmp/audit/yc-companies.json")
REPORT_JSON = Path("/tmp/audit/verification-report.json")
REPORT_MD = Path("/tmp/audit/VERIFICATION_REPORT.md")

UA = "Mozilla/5.0 (compatible; CampusScoutAudit/1.0; +https://dorm-room-fund-scout.vercel.app)"
PRIORITY = ("univ_penn", "univ_berkeley")

# A page shared by several companies, or a personal profile, is not that company's website.
DIRECTORY_HOSTS = {
    "uclaunch.com",
    "freeventures.org",
    "businesswire.com",
    "pulse2.com",
    "desaiaccelerator.com",
    "luma.com",
    "hypepotamus.com",
    "browndailyherald.com",
    "ajaxhealth.com",
    "techcrunch.com",
    "businessinsider.com",
    "medium.com",
    "substack.com",
    "devpost.com",
    "grasp.upenn.edu",
    "dca.wharton.upenn.edu",
    "ycombinator.com",
    "www.ycombinator.com",
}

NAME_STOP = {
    "inc", "llc", "co", "labs", "lab", "ai", "the", "app", "io", "hq", "inc",
    "company", "studios", "studio", "technologies", "technology", "systems",
    "robotics", "health", "bio", "and", "of", "for",
}


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower()


def tokens(text: str) -> list[str]:
    parts = re.findall(r"[a-z0-9]+", fold(text))
    return [p for p in parts if len(p) > 1 and p not in NAME_STOP]


def host_of(url: str | None) -> str:
    if not url:
        return ""
    m = re.search(r"https?://([^/]+)", url.strip(), re.I)
    if not m:
        return ""
    return m.group(1).lower().removeprefix("www.")


def cache_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:24]


def fetch(url: str, timeout: int = 12) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as res:
            raw = res.read(120_000)
            ctype = res.headers.get("content-type", "")
            charset = "utf-8"
            m = re.search(r"charset=([\w-]+)", ctype, re.I)
            if m:
                charset = m.group(1)
            try:
                body = raw.decode(charset, errors="replace")
            except LookupError:
                body = raw.decode("utf-8", errors="replace")
            return {
                "ok": 200 <= res.status < 400,
                "status": res.status,
                "final_url": res.geturl(),
                "title": page_title(body),
                "description": meta_description(body),
                "text": visible_snippet(body),
                "html": body,
                "error": None,
            }
    except urllib.error.HTTPError as err:
        return {"ok": False, "status": err.code, "final_url": url, "title": "", "description": "", "text": "", "html": "", "error": f"HTTP {err.code}"}
    except Exception as err:  # noqa: BLE001 — audit should record every failure mode
        return {"ok": False, "status": None, "final_url": url, "title": "", "description": "", "text": "", "html": "", "error": f"{type(err).__name__}: {err}"[:240]}


def page_title(body: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
    if not m:
        return ""
    return re.sub(r"\s+", " ", html.unescape(m.group(1))).strip()[:240]


def meta_description(body: str) -> str:
    m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', body, re.I | re.S)
    if not m:
        m = re.search(r'<meta[^>]+content=["\'](.*?)["\'][^>]+name=["\']description["\']', body, re.I | re.S)
    if not m:
        return ""
    return re.sub(r"\s+", " ", html.unescape(m.group(1))).strip()[:400]


def visible_snippet(body: str) -> str:
    text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", body)
    text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text[:4000]


def load_cached(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def save_cached(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Drop raw HTML from the cache; the extracted fields are enough to re-score.
    slim = {k: v for k, v in payload.items() if k != "html"}
    path.write_text(json.dumps(slim))


def extract_yc(body: str) -> dict:
    text = html.unescape(body)
    founded = re.search(r"Founded in (\d{4}) by ([^.,]{3,200})", text)
    founders = []
    matches = list(re.finditer(r'"full_name":"([^"]+)","title":"([^"]+)"', text))
    # Profile links sit after full_name/title and before the next founder.
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else min(len(text), match.end() + 2500)
        span = text[match.end():end]
        linkedin = re.findall(r'"linkedin_url":"(https://www\.linkedin\.com/in/[^"]+)"', span)
        twitter = re.findall(r'"twitter_url":"(https://(?:x|twitter)\.com/[^"]+)"', span)
        founders.append({
            "name": match.group(1),
            "title": match.group(2),
            "linkedin": linkedin[0] if linkedin else None,
            "twitter": twitter[0] if twitter else None,
        })
    company_linkedin = re.findall(r'"linkedin_url":"(https://www\.linkedin\.com/company/[^"]+)"', text)
    return {
        "founded_year": founded.group(1) if founded else None,
        "founded_by": founded.group(2).strip() if founded else None,
        "founders": founders,
        "company_linkedin": company_linkedin[0] if company_linkedin else None,
        "title": page_title(body),
    }


def name_in_text(name: str, text: str) -> bool:
    parts = [p for p in tokens(name) if len(p) >= 3]
    if not parts:
        parts = tokens(name)
    if not parts:
        return False
    blob = fold(text)
    compact = re.sub(r"[^a-z0-9]", "", blob)
    hits = 0
    for part in parts:
        if part in blob or part in compact:
            hits += 1
    # A single distinctive token is enough for short names ("Bud", "Atla").
    if len(parts) == 1:
        return hits == 1
    return hits >= max(1, len(parts) - 1) and (parts[0] in compact or parts[-1] in compact or hits == len(parts))


def linkedin_slug(url: str) -> str:
    path = re.sub(r"[?#].*$", "", url).rstrip("/")
    slug = path.split("/")[-1].lower()
    slug = re.sub(r"-[0-9a-f]{5,}$", "", slug)
    return slug


def slug_matches_person(name: str, url: str) -> bool:
    slug = re.sub(r"[^a-z0-9]", "", linkedin_slug(url))
    parts = [p for p in tokens(name) if len(p) >= 3]
    if not parts:
        parts = [p for p in re.findall(r"[a-z0-9]+", fold(name)) if len(p) >= 2]
    if not parts:
        return True
    last = parts[-1]
    first = parts[0]
    last_ok = last in slug
    first_ok = first in slug
    if len(last) >= 4:
        return last_ok
    return last_ok or first_ok


def person_name_parts(name: str) -> tuple[str, str]:
    parts = [p for p in re.findall(r"[A-Za-z][A-Za-z'’-]+", name)]
    if not parts:
        return "", ""
    return fold(parts[0]), fold(parts[-1])


def load_db() -> tuple[list[dict], list[dict]]:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    companies = []
    for row in db.execute(
        """
        SELECT id, name, sector, description, website_url, primary_link, primary_link_kind, is_investable_candidate
        FROM projects WHERE kind = 'company'
        """
    ):
        companies.append(dict(row))
    by_id = {c["id"]: c for c in companies}
    for row in db.execute(
        """
        SELECT project_id, fact_key, value_text, source_url, excerpt, origin
        FROM company_facts
        """
    ):
        company = by_id.get(row["project_id"])
        if not company:
            continue
        company.setdefault("facts", []).append(dict(row))
    for row in db.execute(
        """
        SELECT project_id, tag, is_primary FROM project_sector_tags
        """
    ):
        company = by_id.get(row["project_id"])
        if not company:
            continue
        company.setdefault("tags", []).append(dict(row))
    campuses = defaultdict(set)
    people_rows = db.execute(
        """
        SELECT pe.id, pe.name, pe.aliases_json, pe.enrollment_status, pe.enrollment_label,
               pe.enrollment_basis, pe.enrollment_evidence, pe.founder_status,
               ppr.project_id, ppr.role, a.university_id, u.name AS university_name
        FROM person_project_roles ppr
        JOIN people pe ON pe.id = ppr.person_id
        JOIN projects p ON p.id = ppr.project_id AND p.kind = 'company'
        LEFT JOIN affiliations a ON a.person_id = pe.id
        LEFT JOIN universities u ON u.id = a.university_id
        """
    ).fetchall()
    founders_by_company = defaultdict(list)
    people: dict[str, dict] = {}
    for row in people_rows:
        item = dict(row)
        founders_by_company[item["project_id"]].append(item)
        if item["university_id"]:
            campuses[item["project_id"]].add(item["university_id"])
        person = people.setdefault(item["id"], {
            "id": item["id"],
            "name": item["name"],
            "aliases_json": item["aliases_json"],
            "enrollment_status": item["enrollment_status"],
            "enrollment_label": item["enrollment_label"],
            "enrollment_basis": item["enrollment_basis"],
            "enrollment_evidence": item["enrollment_evidence"],
            "founder_status": item["founder_status"],
            "roles": [],
            "universities": [],
        })
        person["roles"].append({
            "project_id": item["project_id"],
            "role": item["role"],
            "company": by_id.get(item["project_id"], {}).get("name"),
        })
        if item["university_id"] and item["university_id"] not in [u["id"] for u in person["universities"]]:
            person["universities"].append({"id": item["university_id"], "name": item["university_name"]})
    claims = defaultdict(list)
    for row in db.execute(
        """
        SELECT entity_id, claim_type, value_json, excerpt, source_url, verification_state
        FROM claims
        WHERE entity_type = 'person' AND claim_type IN ('profile_link', 'affiliation', 'linkedin_alias_discovered', 'linkedin_candidate')
        """
    ):
        claims[row["entity_id"]].append(dict(row))
    for person in people.values():
        person["claims"] = claims.get(person["id"], [])
    for company in companies:
        company["founders"] = founders_by_company.get(company["id"], [])
        company["campuses"] = sorted(campuses.get(company["id"], []))
        company["priority"] = priority_of(company)
    db.close()
    return companies, list(people.values())


def priority_of(company: dict) -> int:
    campuses = set(company.get("campuses") or [])
    default = any(
        (f.get("enrollment_status") in ("current_student", "recent_grad"))
        for f in company.get("founders") or []
        if "founder" in (f.get("role") or "")
    )
    if "univ_penn" in campuses and default:
        return 0
    if "univ_penn" in campuses:
        return 1
    if "univ_berkeley" in campuses and default:
        return 2
    if "univ_berkeley" in campuses:
        return 3
    if default:
        return 4
    return 5


def yc_index() -> dict[str, dict]:
    if not YC_JSON.exists():
        raise SystemExit(f"Missing {YC_JSON}. Download https://yc-oss.github.io/api/companies/all.json first.")
    data = json.loads(YC_JSON.read_text())
    return {row["slug"]: row for row in data}


def company_slugs(companies: list[dict]) -> dict[str, str]:
    out = {}
    for company in companies:
        blob = " ".join(
            [company.get("primary_link") or "", company.get("website_url") or ""]
            + [f.get("source_url") or "" for f in company.get("facts") or []]
        )
        m = re.search(r"ycombinator\.com/companies/([^/?#\s]+)", blob)
        if m:
            out[company["id"]] = m.group(1).strip().strip("/")
    return out


def cached_fetch(url: str, kind: str) -> dict:
    path = CACHE / kind / f"{cache_key(url)}.json"
    hit = load_cached(path)
    if hit and hit.get("url") == url:
        return hit
    result = fetch(url)
    result["url"] = url
    if kind == "yc" and result.get("html"):
        result["yc"] = extract_yc(result["html"])
        result.pop("html", None)
        result.pop("text", None)
    else:
        result.pop("html", None)
    save_cached(path, result)
    return result


def run_fetches(urls: list[tuple[str, str]], workers: int) -> None:
    pending = []
    for url, kind in urls:
        path = CACHE / kind / f"{cache_key(url)}.json"
        hit = load_cached(path)
        if not (hit and hit.get("url") == url):
            pending.append((url, kind))
    print(f"fetching {len(pending)} pages ({len(urls) - len(pending)} cached)", flush=True)
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(cached_fetch, url, kind): (url, kind) for url, kind in pending}
        for future in as_completed(futures):
            done += 1
            url, kind = futures[future]
            try:
                result = future.result()
                status = result.get("status")
            except Exception as err:  # noqa: BLE001
                status = f"err {err}"
            if done % 50 == 0 or done == len(pending):
                print(f"  {done}/{len(pending)} last {kind} {status} {url[:80]}", flush=True)


def github_logins(person: dict) -> list[str]:
    logins = []
    try:
        aliases = json.loads(person.get("aliases_json") or "[]")
    except json.JSONDecodeError:
        aliases = []
    for alias in aliases:
        if isinstance(alias, str) and alias.startswith("github:"):
            raw = alias.split(":", 1)[1]
            login = raw.rstrip("/").split("/")[-1]
            if login and login not in logins:
                logins.append(login)
    for claim in person.get("claims") or []:
        if claim.get("claim_type") != "profile_link":
            continue
        try:
            value = json.loads(claim.get("value_json") or "{}")
        except json.JSONDecodeError:
            continue
        if value.get("type") == "github" and value.get("url"):
            login = str(value["url"]).rstrip("/").split("/")[-1]
            if login and login not in logins:
                logins.append(login)
    return logins


def linkedin_urls(person: dict) -> list[tuple[str, str]]:
    found = []
    try:
        aliases = json.loads(person.get("aliases_json") or "[]")
    except json.JSONDecodeError:
        aliases = []
    for alias in aliases:
        if isinstance(alias, str) and alias.startswith("linkedin:http"):
            found.append((alias[len("linkedin:"):], "alias"))
    for claim in person.get("claims") or []:
        if claim.get("claim_type") not in ("profile_link", "linkedin_alias_discovered", "linkedin_candidate"):
            continue
        try:
            value = json.loads(claim.get("value_json") or "{}")
        except json.JSONDecodeError:
            continue
        url = value.get("url") or ""
        if "linkedin.com/in/" in url:
            found.append((url, claim.get("verification_state") or "claim"))
    # unique
    seen = set()
    out = []
    for url, status in found:
        key = linkedin_slug(url)
        if key in seen:
            continue
        seen.add(key)
        out.append((url, status))
    return out


def analyze(companies: list[dict], people: list[dict], yc_by_slug: dict[str, dict], slugs: dict[str, str]) -> dict:
    issues = []
    startup_outcomes = []
    for company in companies:
        flags = []
        slug = slugs.get(company["id"])
        yc = yc_by_slug.get(slug) if slug else None
        yc_page = None
        if slug:
            cached = load_cached(CACHE / "yc" / f"{cache_key(f'https://www.ycombinator.com/companies/{slug}')}.json")
            if cached:
                yc_page = cached.get("yc")
                if not cached.get("ok"):
                    flags.append({"field": "yc_page", "issue": "yc_page_unreachable", "detail": cached.get("error") or cached.get("status")})
        website = (company.get("website_url") or "").strip()
        site_host = host_of(website)
        shared = False
        if website and site_host in DIRECTORY_HOSTS:
            flags.append({"field": "website", "issue": "directory_or_profile_as_website", "detail": website})
        site = None
        if website and site_host not in DIRECTORY_HOSTS:
            site = load_cached(CACHE / "web" / f"{cache_key(website)}.json")
            if site and not site.get("ok"):
                flags.append({"field": "website", "issue": "website_unreachable", "detail": site.get("error") or site.get("status"), "url": website})
            elif site and site.get("ok"):
                blob = " ".join([site.get("title") or "", site.get("description") or "", site.get("text") or ""])
                thin = len(re.sub(r"\s+", " ", blob).strip()) < 80
                if thin:
                    flags.append({
                        "field": "website",
                        "issue": "website_content_thin",
                        "detail": (site.get("title") or "(no title)")[:180],
                        "url": site.get("final_url") or website,
                    })
                elif not name_in_text(company["name"], blob) and not name_in_text(company["name"], site.get("final_url") or ""):
                    flags.append({
                        "field": "website",
                        "issue": "website_name_mismatch",
                        "detail": (site.get("title") or "")[:180],
                        "url": site.get("final_url") or website,
                    })
        if yc and website and site_host not in DIRECTORY_HOSTS:
            yc_host = host_of(yc.get("website"))
            if yc_host and site_host and yc_host != site_host:
                flags.append({
                    "field": "website",
                    "issue": "website_differs_from_yc",
                    "detail": f"stored {website} vs YC {yc.get('website')}",
                    "source": yc.get("url"),
                })
        description = company.get("description") or ""
        if re.search(r"GitHub bio as a company they founded", description):
            flags.append({"field": "description", "issue": "self_reported_github_bio", "detail": description[:180]})
        if yc:
            one = yc.get("one_liner") or ""
            long = yc.get("long_description") or ""
            if one and description and not name_overlap(description, one + " " + long):
                flags.append({
                    "field": "description",
                    "issue": "description_differs_from_yc",
                    "detail": f"stored: {description[:140]} || yc: {one[:140]}",
                    "source": yc.get("url"),
                })
        elif site and site.get("ok") and description:
            meta = site.get("description") or ""
            if meta and len(tokens(description)) >= 4 and not name_overlap(description, meta + " " + (site.get("title") or "")):
                # Soft signal only. Company sites often use a tagline that doesn't repeat the stored paragraph.
                flags.append({
                    "field": "description",
                    "issue": "description_not_on_homepage",
                    "detail": f"stored: {description[:120]} || site: {meta[:120]}",
                    "url": website,
                })
        year_facts = [f for f in company.get("facts") or [] if f["fact_key"] == "founded_year"]
        if yc_page and yc_page.get("founded_year") and year_facts:
            stored_year = year_facts[0]["value_text"]
            if stored_year != yc_page["founded_year"]:
                flags.append({
                    "field": "founded_year",
                    "issue": "founded_year_mismatch",
                    "detail": f"stored {stored_year} vs YC page {yc_page['founded_year']}",
                    "source": f"https://www.ycombinator.com/companies/{slug}",
                })
        linkedin_facts = [f for f in company.get("facts") or [] if f["fact_key"] == "company_linkedin"]
        if yc_page and yc_page.get("company_linkedin") and linkedin_facts:
            stored_li = linkedin_facts[0]["value_text"].rstrip("/").lower()
            yc_li = yc_page["company_linkedin"].rstrip("/").lower()
            if stored_li.split("/company/")[-1] != yc_li.split("/company/")[-1]:
                flags.append({
                    "field": "company_linkedin",
                    "issue": "company_linkedin_mismatch",
                    "detail": f"stored {linkedin_facts[0]['value_text']} vs YC {yc_page['company_linkedin']}",
                    "source": f"https://www.ycombinator.com/companies/{slug}",
                })
        for fact in company.get("facts") or []:
            if fact["fact_key"] not in ("investor", "funding_total", "funding_round"):
                continue
            excerpt = fact.get("excerpt") or ""
            value = fact.get("value_text") or ""
            if fact["fact_key"] == "investor" and value and fold(value) not in fold(excerpt) and value.lower() not in ("y combinator",):
                flags.append({
                    "field": "investor",
                    "issue": "investor_not_in_excerpt",
                    "detail": f"{value} not in excerpt: {excerpt[:140]}",
                    "source": fact.get("source_url"),
                })
            if fact["fact_key"] in ("funding_total", "funding_round"):
                amount = re.search(r"\$[\d.,]+\s*[kmb]?", value, re.I)
                if amount and amount.group(0).lower() not in excerpt.lower() and re.sub(r"\s+", "", amount.group(0)).lower() not in re.sub(r"\s+", "", excerpt).lower():
                    flags.append({
                        "field": fact["fact_key"],
                        "issue": "amount_not_in_excerpt",
                        "detail": f"{value} excerpt: {excerpt[:140]}",
                        "source": fact.get("source_url"),
                    })
        if re.search(r"\$\s?\d", description) and not any(f["fact_key"] in ("funding_total", "funding_round") for f in company.get("facts") or []):
            flags.append({"field": "funding", "issue": "funding_amount_only_in_description", "detail": description[:180]})
        our_founders = [f for f in company.get("founders") or [] if "founder" in (f.get("role") or "").lower()]
        if yc_page and yc_page.get("founders"):
            yc_names = [f["name"] for f in yc_page["founders"]]
            for founder in our_founders:
                if not any(same_person(founder["name"], yc_name) for yc_name in yc_names):
                    flags.append({
                        "field": "founders",
                        "issue": "founder_not_on_yc_page",
                        "detail": f"{founder['name']} ({founder.get('role')}) not in YC founders: {', '.join(yc_names[:8])}",
                        "source": f"https://www.ycombinator.com/companies/{slug}",
                    })
        checked = bool(slug or website)
        status = "confirmed" if checked and not flags else ("unverified" if not checked else "partial")
        # description_not_on_homepage is a weak flag; don't fail the record on it alone
        soft = {"description_not_on_homepage", "website_content_thin"}
        hard = [f for f in flags if f["issue"] not in soft]
        if checked and not hard:
            status = "confirmed"
        elif not checked:
            status = "unverified"
        else:
            status = "partial"
        startup_outcomes.append({
            "id": company["id"],
            "name": company["name"],
            "priority": company["priority"],
            "campuses": company["campuses"],
            "status": status,
            "flags": flags,
            "yc_slug": slug,
        })
        for flag in hard:
            issues.append({"entity": "startup", "id": company["id"], "name": company["name"], "priority": company["priority"], "campuses": company["campuses"], **flag})

    founder_outcomes = []
    for person in people:
        founder_roles = [r for r in person["roles"] if "founder" in (r.get("role") or "").lower()]
        if not founder_roles:
            continue
        flags = []
        for url, how in linkedin_urls(person):
            if not slug_matches_person(person["name"], url):
                flags.append({
                    "field": "linkedin",
                    "issue": "linkedin_namesake_risk",
                    "detail": f"{person['name']} vs {url} ({how})",
                })
        for login in github_logins(person):
            cached = load_cached(CACHE / "github" / f"{cache_key('https://api.github.com/users/' + login)}.json")
            if not cached:
                continue
            gh_name = ((cached.get("github") or {}).get("name")) or ""
            if gh_name and not same_person(person["name"], gh_name):
                flags.append({
                    "field": "github",
                    "issue": "github_name_mismatch",
                    "detail": f"stored {person['name']} vs GitHub name {gh_name} (@{login})",
                    "source": f"https://github.com/{login}",
                })
        campus_ids = [u["id"] for u in person["universities"]]
        if not campus_ids:
            flags.append({"field": "school", "issue": "no_campus_on_record", "detail": person["name"]})
        checked = bool(linkedin_urls(person) or github_logins(person) or campus_ids)
        hard = flags
        status = "confirmed" if checked and not hard else ("unverified" if not linkedin_urls(person) and not github_logins(person) else "partial")
        if checked and not hard:
            status = "confirmed"
        elif hard:
            status = "partial"
        else:
            status = "unverified"
        founder_outcomes.append({
            "id": person["id"],
            "name": person["name"],
            "universities": campus_ids,
            "status": status,
            "flags": flags,
            "companies": [r.get("company") for r in founder_roles],
        })
        for flag in flags:
            issues.append({"entity": "founder", "id": person["id"], "name": person["name"], "campuses": campus_ids, **flag})

    return {"startups": startup_outcomes, "founders": founder_outcomes, "issues": issues}


def name_overlap(stored: str, reference: str) -> bool:
    left = set(tokens(stored))
    right = set(tokens(reference))
    if not left or not right:
        return False
    # Short taglines: any shared distinctive token counts.
    if len(left) <= 6 or len(right) <= 6:
        return bool(left & right)
    return len(left & right) / min(len(left), len(right)) >= 0.25


def same_person(a: str, b: str) -> bool:
    at = [p for p in tokens(a) if len(p) >= 3]
    bt = [p for p in tokens(b) if len(p) >= 3]
    if not at or not bt:
        return fold(a) == fold(b)
    return at[-1] == bt[-1] and (at[0] == bt[0] or at[0][:1] == bt[0][:1] or at[0] in bt or bt[0] in at)


def summarize(result: dict) -> str:
    startups = result["startups"]
    founders = result["founders"]
    sc = Counter(s["status"] for s in startups)
    fc = Counter(f["status"] for f in founders)
    issue_counts = Counter((i["entity"], i["issue"]) for i in result["issues"])
    lines = [
        "# Verification audit",
        "",
        f"Startups checked: {len(startups)}",
        f"Startups confirmed: {sc['confirmed']}",
        f"Startups partial: {sc['partial']}",
        f"Startups unverified: {sc['unverified']}",
        "",
        f"Founders checked: {len(founders)}",
        f"Founders confirmed: {fc['confirmed']}",
        f"Founders partial: {fc['partial']}",
        f"Founders unverified: {fc['unverified']}",
        "",
        "## Issue counts",
        "",
    ]
    for (entity, issue), count in issue_counts.most_common():
        lines.append(f"- {entity} {issue}: {count}")
    lines.append("")
    lines.append("## Highest-priority startup issues")
    lines.append("")
    shown = 0
    for issue in sorted(result["issues"], key=lambda i: (i.get("priority", 9), i["name"])):
        if issue["entity"] != "startup":
            continue
        if issue.get("priority", 9) > 3:
            continue
        lines.append(f"- [{issue.get('priority')}] {issue['name']}: {issue['issue']} — {issue.get('detail','')[:180]}")
        shown += 1
        if shown >= 80:
            break
    lines.append("")
    lines.append("## Founder link risks (first 60)")
    lines.append("")
    shown = 0
    for issue in result["issues"]:
        if issue["entity"] != "founder":
            continue
        lines.append(f"- {issue['name']} ({', '.join(issue.get('campuses') or [])}): {issue['issue']} — {issue.get('detail','')[:180]}")
        shown += 1
        if shown >= 60:
            break
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--skip-fetch", action="store_true")
    parser.add_argument("--limit-sites", type=int, default=0)
    args = parser.parse_args()
    companies, people = load_db()
    slugs = company_slugs(companies)
    print(f"companies {len(companies)} founders-with-roles {len(people)} yc slugs {len(slugs)}", flush=True)
    urls: list[tuple[str, str]] = []
    for company_id, slug in slugs.items():
        urls.append((f"https://www.ycombinator.com/companies/{slug}", "yc"))
    sites = []
    for company in sorted(companies, key=lambda c: c["priority"]):
        website = (company.get("website_url") or "").strip()
        if not website:
            continue
        if host_of(website) in DIRECTORY_HOSTS:
            continue
        sites.append(website)
    # unique, priority order preserved
    seen = set()
    ordered_sites = []
    for website in sites:
        if website in seen:
            continue
        seen.add(website)
        ordered_sites.append(website)
    if args.limit_sites:
        ordered_sites = ordered_sites[: args.limit_sites]
    for website in ordered_sites:
        urls.append((website, "web"))
    gh = set()
    for person in people:
        if not any("founder" in (r.get("role") or "") for r in person["roles"]):
            continue
        for login in github_logins(person):
            gh.add(login)
    for login in sorted(gh):
        urls.append((f"https://api.github.com/users/{login}", "github"))
    if not args.skip_fetch:
        run_fetches(urls, args.workers)
        # Attach parsed GitHub payloads
        for login in sorted(gh):
            url = f"https://api.github.com/users/{login}"
            path = CACHE / "github" / f"{cache_key(url)}.json"
            cached = load_cached(path)
            if cached and "github" not in cached and cached.get("text"):
                pass
            if cached and "github" not in cached:
                # fetch() stored title/text from JSON body. Re-read is unnecessary; parse text if present.
                raw = cached.get("text") or ""
                try:
                    # visible_snippet destroyed JSON. Re-fetch from cache is not the raw body.
                    # Store github fields by a dedicated refetch if name missing.
                    cached["github"] = {}
                except Exception:
                    cached["github"] = {}
    # GitHub API responses were passed through HTML extraction. Re-fetch those
    # through a JSON-aware path if the cache has no name.
    fix_github_cache(sorted(gh))
    yc_by_slug = yc_index()
    result = analyze(companies, people, yc_by_slug, slugs)
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    # The full outcome file is large; keep issues plus status counts in git,
    # and write the full outcomes beside the cache.
    summary = {
        "startup_status": dict(Counter(s["status"] for s in result["startups"])),
        "founder_status": dict(Counter(f["status"] for f in result["founders"])),
        "startup_count": len(result["startups"]),
        "founder_count": len(result["founders"]),
        "issues": result["issues"],
    }
    REPORT_JSON.write_text(json.dumps(summary, indent=2))
    REPORT_MD.write_text(summarize(result))
    Path("/tmp/audit/full-outcomes.json").write_text(json.dumps({
        "startups": [{k: v for k, v in s.items() if k != "flags" or v} for s in result["startups"]],
        "founders": result["founders"],
    }))
    print(summarize(result)[:4000], flush=True)
    print(f"wrote {REPORT_MD}", flush=True)


def fix_github_cache(logins: list[str]) -> None:
    for login in logins:
        url = f"https://api.github.com/users/{login}"
        path = CACHE / "github" / f"{cache_key(url)}.json"
        cached = load_cached(path) or {}
        if (cached.get("github") or {}).get("checked"):
            continue
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/vnd.github+json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                data = json.loads(res.read().decode())
            payload = {"url": url, "ok": True, "status": res.status, "github": {"name": data.get("name"), "company": data.get("company"), "bio": data.get("bio"), "blog": data.get("blog"), "checked": True}}
        except Exception as err:  # noqa: BLE001
            payload = {"url": url, "ok": False, "error": str(err)[:200], "github": {"checked": True}}
        save_cached(path, payload)
        time.sleep(0.05)


if __name__ == "__main__":
    main()
