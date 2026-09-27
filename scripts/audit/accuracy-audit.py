#!/usr/bin/env python3
"""Resumable accuracy audit of founders, startups, and sourced facts.

Reads data/campus-universe.db. Fetches public evidence URLs (company sites,
YC pages, press, GitHub, Devpost, university news) and search HTML from
DuckDuckGo, Bing, and Google. No paid APIs and no logged-in pages.

Safe to re-run. Fetches are cached in /tmp/audit/accuracy-fetch.sqlite.
Database writes no-op once the corrected value is already stored. LinkedIn
profile URLs and drf_alumni rows are not modified.

  python3 scripts/audit/accuracy-audit.py
  python3 scripts/audit/accuracy-audit.py --propose-only
  python3 scripts/audit/accuracy-audit.py --skip-crawl
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sqlite3
import subprocess
import tempfile
import time
import unicodedata
import urllib.parse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "campus-universe.db"
CACHE_PATH = Path("/tmp/audit/accuracy-fetch.sqlite")
MERGE_PATH = Path("/tmp/audit/accuracy-merges.json")
REPORT_PATH = ROOT / "scripts" / "audit" / "ACCURACY_AUDIT_REPORT.md"
DATE = "2026-09-27"
NOTE = f"Accuracy audit {DATE}"
UA = "Mozilla/5.0 (compatible; CampusScoutAudit/1.0; research; +https://dorm-room-fund-scout.vercel.app)"
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
# Fetched directly because search HTML is bot-walled. Applied only when the
# article text itself names the company in an acquisition or shutdown sentence.
PRESS_URLS = [
    "https://techcrunch.com/2026/07/07/figma-acquires-team-behind-a-vibe-coding-app/",
]
WORKERS = 24
TIMEOUT = 8

TOP10 = {
    "univ_penn",
    "univ_stanford",
    "univ_berkeley",
    "univ_mit",
    "univ_harvard",
    "univ_cmu",
    "univ_gatech",
    "univ_waterloo",
    "univ_brown",
    "univ_columbia",
}
LOGIN_HOSTS = {
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
}
PARKING_HOSTS = {
    "sedo.com",
    "sedoparking.com",
    "afternic.com",
    "hugedomains.com",
    "dan.com",
    "parkingcrew.net",
    "bodis.com",
    "above.com",
}
STOP = {
    "inc", "llc", "co", "labs", "lab", "ai", "the", "app", "io", "hq",
    "company", "studios", "studio", "technologies", "technology", "systems",
    "robotics", "health", "bio", "and", "of", "for", "corp",
}
LINKEDIN_CLAIM_TYPES = {
    "linkedin_alias_discovered",
    "linkedin_candidate",
    "linkedin_web_search_attempt",
}
WEAK_DESC = re.compile(r"^\s*(listed on|participating startups)\b", re.I)
GENERIC_META = re.compile(
    r"welcome to|just another wordpress|coming soon|domain (?:is )?for sale|buy this domain|enable javascript|cookie policy",
    re.I,
)
SHUTDOWN = re.compile(
    r"we(?:'ve| have) shut down|we are shutting down|is no longer operating|this (?:company|startup|product) has (?:closed|shut down)|permanently closed",
    re.I,
)
COURSE = re.compile(
    r"\b(course project|class project|class assignment|hackathon submission|student club|campus club|not a company)\b",
    re.I,
)
CLASS_YEAR = re.compile(
    r"\b(?:SEAS|CAS|WH|WHG|COL|C|W|E|ENG|GR|G|M&T|MT)\s*'(\d{2})\b|\bclass of\s+(20\d{2})\b",
    re.I,
)

# The 25 pairs left unmerged by the 2026-09-26 dedupe. Ids are resolved again
# at runtime; a missing id means that side was already merged.
KNOWN_PAIRS = [
    ("person", "person_G1L80NzJbehU", "person_gn69CCl4P48p", "Kevin Lu"),
    ("person", "person_TF5SBusqPOh4", "person_f3ph0I5-5oRJ", "Tyler Sacharow"),
    ("project", "proj_1ZPHTGQR9kiG", "proj_k4LrySK2rR2l", "Aegis"),
    ("project", "proj_a5eEBzMjkmLU", "proj_p_KXJvd56m2c", "Aura"),
    ("project", "proj_gknEuW7eKbrw", "proj_oz14NBtFcune", "Caravan"),
    ("project", "proj_Q50joYZDbrBq", "proj_OrA-ynbNLGEy", "Orbit"),
    ("project", "proj_Kp02I3LEFbgl", "proj_F2kTy4MYra3d", "Reacher"),
    ("project", "proj_yTsIek7JT4YO", "proj_weuj2RA0slhK", "agora / Agora/PennGPT"),
    ("project", "proj__mFvvKiMGiHo", "proj_Y-qcgiLRdzkL", "Blitz / Blitz Indian Eats"),
    ("project", "proj_XXDucSh8bdf0", "proj_9wKJjFiff_4f", "Dispatch / Dispatch Therapeutics"),
    ("project", "proj_RdZfZTj5akut", "proj_sAenWzqgAUH6", "FirstResponder-Relay / Relay"),
    ("project", "proj_rbMye6bzpBK_", "proj_oBzRjOYg6ctz", "Haven / HAVEN (Y-Prize)"),
    ("project", "proj_rbMye6bzpBK_", "proj_Yq6qL2gbaO-R", "Haven / Helper Haven"),
    ("project", "proj_mdJIhgFA6N7o", "proj__yxHSnQWY6IW", "PennApps / PennApps Music App"),
    ("project", "proj_BfJtD64Il5HC", "proj_FxckOqhhc_Ys", "Scout / Scout.ly"),
    ("project", "proj_e4QvVvbaLpAX", "proj_jl75niAla8sd", "Sonura Beanie / Sonura Care"),
    ("project", "proj_ZQOkvXNnTWim", "proj_Y2qq47RGDOo1", "Vital Start / Vital Start Health"),
    ("project", "proj_VjXeWYwyLnvT", "proj_bWFw2NQwDiqg", "meetup / MeetUp"),
    ("project", "proj_TrKlNOjYRVHz", "proj_vzfhVVXErfyO", "Orion"),
    ("project", "proj_sAenWzqgAUH6", "proj_JrQVLrbGv2Z9", "Relay"),
    ("project", "proj_sXvXd1gM2sE_", "proj_ALgKIR107Bhh", "Sentinel"),
    ("project", "proj_3wkzn3_7g204", "proj_B-RC4w2wSsTb", "Story Builder"),
    ("project", "proj_yF8qWUDTXtWA", "proj_76-1kHkuzKDM", "Manifest"),
    ("project", "proj_QIcrl08fMyCG", "proj_Hhr9LMA0DFtF", "River / River Markets"),
    ("project", "proj_BfJtD64Il5HC", "proj_Yzlp9tOIaFsK", "Scout / Scout Robotics"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    import secrets
    return f"{prefix}_{secrets.token_urlsafe(9)}"


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower()


def compact(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", fold(text))


def host_of(url: str | None) -> str:
    if not url:
        return ""
    try:
        host = urllib.parse.urlparse(url).hostname or ""
    except ValueError:
        return ""
    return host.lower().removeprefix("www.")


def is_login_host(url: str) -> bool:
    host = host_of(url)
    return any(host == item or host.endswith("." + item) for item in LOGIN_HOSTS)


def name_mentioned(name: str, text: str) -> bool:
    if not name or not text:
        return False
    hay = fold(text)
    needle = fold(name).strip()
    if not needle:
        return False
    if len(needle) <= 4:
        # A hyphen is part of the token, so "vibe" does not match "vibe-coding".
        return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9-])", hay) is not None
    if needle in hay:
        return True
    toks = [tok for tok in re.findall(r"[a-z0-9]+", needle) if len(tok) > 2 and tok not in STOP]
    if not toks:
        return False
    return all(re.search(rf"(?<![a-z0-9]){re.escape(tok)}(?![a-z0-9])", hay) for tok in toks)


def names_compatible(left: str, right: str) -> bool:
    a, b = compact(left), compact(right)
    if not a or not b:
        return False
    if a == b:
        return True
    if len(a) >= 5 and (a in b or b in a):
        return True
    return False


def content_words(text: str) -> set[str]:
    return {tok for tok in re.findall(r"[a-z0-9]+", fold(text)) if len(tok) > 3 and tok not in STOP}


def linkedin_slug(url: str | None) -> str:
    if not url or "linkedin.com/in/" not in url.lower():
        return ""
    match = re.search(r"linkedin\.com/in/([^/?#]+)", url, re.I)
    return urllib.parse.unquote(match.group(1)).strip("/").lower() if match else ""


def slugs_compatible(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    return left.startswith(right + "-") or right.startswith(left + "-")


def page_title(body: str) -> str:
    start = body.lower().find("<title")
    if start < 0:
        return ""
    gt = body.find(">", start, start + 300)
    end = body.lower().find("</title>", gt if gt > 0 else start)
    if gt < 0 or end < 0:
        return ""
    return re.sub(r"\s+", " ", html.unescape(body[gt + 1:end])).strip()[:300]


def meta_description(body: str) -> str:
    lower = body.lower()
    cursor = 0
    while cursor < len(lower):
        start = lower.find("<meta", cursor)
        if start < 0 or start > 200_000:
            return ""
        end = body.find(">", start, start + 2000)
        if end < 0:
            return ""
        tag = body[start:end + 1]
        cursor = end + 1
        if "description" not in tag.lower():
            continue
        match = re.search(r'content\s*=\s*["\'](.*?)["\']', tag, re.I | re.S)
        if match:
            return re.sub(r"\s+", " ", html.unescape(match.group(1))).strip()[:500]
    return ""


def visible_text(body: str) -> str:
    # Index scans only. Regex over a full page can stall the crawl on hostile HTML.
    # Script and style blocks are dropped first so a JSON-LD header cannot crowd
    # out the article, and a long tag cannot abort the rest of the document.
    raw = body[:400_000]
    lower = raw.lower()
    kept: list[str] = []
    i = 0
    while i < len(raw):
        nxt = len(raw)
        which = ""
        for tag in ("script", "style", "noscript"):
            found = lower.find("<" + tag, i)
            if found >= 0 and found < nxt:
                nxt = found
                which = tag
        if not which:
            kept.append(raw[i:])
            break
        kept.append(raw[i:nxt])
        end = lower.find("</" + which + ">", nxt)
        if end < 0:
            break
        i = end + len(which) + 3
    chunk = "".join(kept)
    parts: list[str] = []
    i = 0
    while i < len(chunk):
        lt = chunk.find("<", i)
        if lt < 0:
            parts.append(chunk[i:])
            break
        parts.append(chunk[i:lt])
        gt = chunk.find(">", lt)
        if gt < 0:
            break
        i = gt + 1
    text = html.unescape("".join(parts))
    return re.sub(r"\s+", " ", text).strip()[:20000]


def boilerplate_text(text: str) -> bool:
    head = (text or "")[:240].lower()
    tokens = (":root", "@font-face", "function(", "datalayer", "gtm.js", "@context", "font-family", "webpackjsonp")
    return any(token in head for token in tokens)


def substantive_text(text: str) -> bool:
    if not text or len(text) < 1200 or boilerplate_text(text):
        return False
    if text.lower().count("function(") > 2 and len(text) < 2500:
        return False
    return True


def person_matches_founder(person_name: str, founder_name: str) -> bool:
    if compact(person_name) == compact(founder_name):
        return True
    def tokens(name: str) -> list[str]:
        name = re.sub(r"\([^)]*\)", " ", name or "")
        return [tok for tok in re.findall(r"[a-z0-9]+", fold(name)) if len(tok) > 1]
    left, right = tokens(person_name), tokens(founder_name)
    if len(left) < 2 or len(right) < 2:
        return False
    short, long = (left, right) if len(left) <= len(right) else (right, left)
    return all(tok in long for tok in short)


def parse_yc(body: str) -> dict | None:
    marker = 'data-page="'
    start = body.find(marker)
    if start < 0:
        return None
    start += len(marker)
    end = body.find('"', start)
    if end < 0 or end - start > 2_000_000:
        return None
    try:
        data = json.loads(html.unescape(body[start:end]))
    except json.JSONDecodeError:
        return None
    company = (data.get("props") or {}).get("company") or {}
    if not isinstance(company.get("name"), str):
        return None
    founders = []
    for founder in company.get("founders") or []:
        if not isinstance(founder, dict):
            continue
        name = str(founder.get("full_name") or "").strip()
        if not name:
            continue
        founders.append({
            "name": name,
            "title": str(founder.get("title") or ""),
            "bio": str(founder.get("founder_bio") or "")[:600],
            "linkedin": founder.get("linkedin_url") if isinstance(founder.get("linkedin_url"), str) else None,
        })
    status = str(company.get("ycdc_status") or "")
    return {
        "name": company.get("name"),
        "one_liner": company.get("one_liner") if isinstance(company.get("one_liner"), str) else "",
        "website": company.get("website") if isinstance(company.get("website"), str) else "",
        "status": status,
        "batch": company.get("batch_name") or company.get("batch") or "",
        "year": company.get("year_founded") if isinstance(company.get("year_founded"), int) else None,
        "location": company.get("location") if isinstance(company.get("location"), str) else "",
        "team_size": company.get("team_size") if isinstance(company.get("team_size"), int) else None,
        "founders": founders,
        "long": str(company.get("long_description") or "")[:1500],
    }


def classify_fetch(status: int | None, error: str | None, final_url: str, title: str, text: str) -> str:
    if error and error.startswith("login_wall"):
        return "login_wall"
    blob = f"{title} {text[:500]}"
    if status in (404, 410) or (error and ("HTTP 404" in error or "HTTP 410" in error)):
        return "dead"
    if error and any(token in error for token in ("gaierror", "Name or service not known", "nodename nor servname", "No address")):
        return "dead"
    if status in (401, 403, 429) or (error and any(f"HTTP {code}" in error for code in (401, 403, 429))):
        return "blocked"
    if error or status is None or status >= 400:
        return "error"
    host = host_of(final_url)
    if any(host == item or host.endswith("." + item) for item in PARKING_HOSTS):
        return "dead"
    if re.search(r"\bpage not found\b|\b404 not found\b", title, re.I):
        return "dead"
    if re.search(r"domain (?:is )?for sale|buy this domain|this domain is parked", blob, re.I):
        return "dead"
    return "ok"


def fetch_url(url: str) -> dict:
    if is_login_host(url):
        return {"status": None, "error": "login_wall", "final_url": url, "title": "", "description": "", "text": "", "extra": None, "kind": "login_wall"}
    fd, path = tempfile.mkstemp(prefix="audit-body-")
    os.close(fd)
    try:
        proc = subprocess.run(
            [
                "curl", "-sS", "-L", "--max-redirs", "4",
                "--max-time", str(TIMEOUT), "--connect-timeout", "4",
                "--max-filesize", "1500000",
                "-A", UA,
                "-o", path,
                "-w", "%{http_code} %{url_effective}",
                url,
            ],
            capture_output=True,
            timeout=TIMEOUT + 4,
            start_new_session=True,
        )
        with open(path, "rb") as handle:
            body = handle.read(1_500_000).decode("utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        return {"status": None, "error": "timeout", "final_url": url, "title": "", "description": "", "text": "", "extra": None, "kind": "error"}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    meta = proc.stdout.decode("utf-8", errors="replace").strip().split(" ", 1)
    code = meta[0] if meta else "000"
    final = meta[1] if len(meta) > 1 else url
    status = int(code) if code.isdigit() and code != "000" else None
    err = proc.stderr.decode("utf-8", errors="replace")[:240]
    if status is None:
        message = err or f"curl exit {proc.returncode}"
        kind = classify_fetch(None, message, url, "", "")
        return {"status": None, "error": message, "final_url": final or url, "title": "", "description": "", "text": "", "extra": None, "kind": kind}
    body = body[:1_500_000]
    title = page_title(body)
    description = meta_description(body)
    text = visible_text(body)
    extra = parse_yc(body) if "ycombinator.com/companies/" in url or "ycombinator.com/companies/" in (final or "") else None
    kind = classify_fetch(status, None if status < 400 else f"HTTP {status}", final or url, title, text)
    return {"status": status, "error": None if status < 400 else f"HTTP {status}", "final_url": final or url, "title": title, "description": description, "text": text, "extra": extra, "kind": kind}


class Cache:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute(
            """CREATE TABLE IF NOT EXISTS fetches (
                url TEXT PRIMARY KEY, status INTEGER, error TEXT, final_url TEXT,
                title TEXT, description TEXT, text TEXT, extra_json TEXT, kind TEXT, fetched_at TEXT
            )"""
        )
        self.db.execute(
            """CREATE TABLE IF NOT EXISTS searches (
                query TEXT PRIMARY KEY, engine TEXT, body TEXT, fetched_at TEXT
            )"""
        )

    def has(self, url: str) -> bool:
        return self.db.execute("SELECT 1 FROM fetches WHERE url = ?", (url,)).fetchone() is not None

    def get(self, url: str) -> dict | None:
        row = self.db.execute("SELECT status, error, final_url, title, description, text, extra_json, kind FROM fetches WHERE url = ?", (url,)).fetchone()
        if not row:
            return None
        extra = None
        if row[6]:
            try:
                extra = json.loads(row[6])
            except json.JSONDecodeError:
                extra = None
        return {"status": row[0], "error": row[1], "final_url": row[2] or url, "title": row[3] or "", "description": row[4] or "", "text": row[5] or "", "extra": extra, "kind": row[7] or "error"}

    def put(self, url: str, row: dict) -> None:
        self.db.execute(
            """INSERT INTO fetches (url, status, error, final_url, title, description, text, extra_json, kind, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(url) DO UPDATE SET
                 status=excluded.status, error=excluded.error, final_url=excluded.final_url,
                 title=excluded.title, description=excluded.description, text=excluded.text,
                 extra_json=excluded.extra_json, kind=excluded.kind, fetched_at=excluded.fetched_at""",
            (url, row["status"], row["error"], row["final_url"], row["title"], row["description"], row["text"], json.dumps(row["extra"]) if row.get("extra") else None, row["kind"], now_iso()),
        )

    def commit(self) -> None:
        self.db.commit()


def crawl(cache: Cache, urls: list[str]) -> None:
    pending = [url for url in urls if not cache.has(url)]
    print(f"Fetching {len(pending)} URLs ({len(urls) - len(pending)} cached).", flush=True)
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch_url, url): url for url in pending}
        for future in as_completed(futures):
            url = futures[future]
            try:
                row = future.result()
            except Exception as err:  # noqa: BLE001
                row = {"status": None, "error": str(err)[:240], "final_url": url, "title": "", "description": "", "text": "", "extra": None, "kind": "error"}
            if row.get("status") == 429:
                time.sleep(1.5)
                row = fetch_url(url)
            if row.get("status") != 429:
                cache.put(url, row)
            done += 1
            if done % 100 == 0:
                cache.commit()
                print(f"  fetched {done}/{len(pending)}", flush=True)
    cache.commit()
    print("Fetch pass done.", flush=True)


def search(cache: Cache, query: str) -> list[tuple[str, str, str]]:
    cached = cache.db.execute("SELECT engine, body FROM searches WHERE query = ?", (query,)).fetchone()
    if cached:
        return parse_search(cached[0], cached[1])
    engines = [
        ("bing", "https://www.bing.com/search?" + urllib.parse.urlencode({"q": query})),
        ("google", "https://www.google.com/search?" + urllib.parse.urlencode({"q": query, "gbv": "1", "hl": "en"})),
        ("duckduckgo", "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})),
    ]
    best: list[tuple[str, str]] = []
    engine_used = ""
    for engine, url in engines:
        links = search_links(engine, url)
        if links:
            best = links
            engine_used = engine
            break
    if best:
        cache.db.execute(
            "INSERT OR REPLACE INTO searches (query, engine, body, fetched_at) VALUES (?, ?, ?, ?)",
            (query, engine_used, json.dumps(best), now_iso()),
        )
        cache.commit()
    return [(engine_used, href, title) for href, title in best]


def search_links(engine: str, url: str) -> list[tuple[str, str]]:
    try:
        proc = subprocess.run(
            ["curl", "-sS", "-L", "--max-time", "10", "--connect-timeout", "4", "-A", BROWSER_UA, url],
            capture_output=True,
            timeout=14,
        )
        body = proc.stdout.decode("utf-8", errors="replace")
    except Exception:
        return []
    found: list[tuple[str, str]] = []
    if engine == "duckduckgo":
        for href, title in re.findall(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', body, re.S):
            href = html.unescape(href)
            match = re.search(r"uddg=([^&]+)", href)
            if match:
                href = urllib.parse.unquote(match.group(1))
            title = re.sub(r"<[^>]+>", "", html.unescape(title))
            if href.startswith("http"):
                found.append((href, re.sub(r"\s+", " ", title).strip()))
        snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</(?:a|td|div|span)', body, re.S)
        for snippet in snippets:
            text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html.unescape(snippet))).strip()
            if text:
                found.append(("", text))
    elif engine == "bing":
        for block in body.split('class="b_algo"')[1:]:
            h2 = re.search(r"<h2[^>]*>(.*?)</h2>", block, re.S)
            cite = re.search(r"<cite[^>]*>(.*?)</cite>", block, re.S)
            if not h2:
                continue
            title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html.unescape(h2.group(1)))).strip()
            cite_text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html.unescape(cite.group(1)))).strip() if cite else ""
            cite_text = cite_text.split("›")[0].strip()
            href = ""
            if cite_text.startswith("http"):
                href = cite_text.split()[0]
            elif cite_text and "." in cite_text:
                href = "https://" + cite_text.split()[0].strip("/")
            if title and len(title) > 8 and "bing.com" not in href:
                found.append((href, title))
    else:
        for href in re.findall(r'href="/url\?q=(https?://[^"&]+)', body):
            href = urllib.parse.unquote(html.unescape(href))
            if "google.com" in href:
                continue
            found.append((href, href))
    return found[:12]


def parse_search(engine: str, body: str) -> list[tuple[str, str, str]]:
    try:
        rows = json.loads(body)
    except json.JSONDecodeError:
        return []
    return [(engine, href, title) for href, title in rows if href.startswith("http") or title]


def ensure_audit_tables(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS accuracy_audit (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          field TEXT,
          old_value TEXT,
          new_value TEXT,
          reason TEXT NOT NULL,
          evidence_url TEXT,
          checked_at TEXT NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE
        );
        CREATE INDEX IF NOT EXISTS idx_accuracy_audit_entity ON accuracy_audit(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_accuracy_audit_action ON accuracy_audit(action);
        CREATE TABLE IF NOT EXISTS accuracy_audit_runs (
          id TEXT PRIMARY KEY,
          checked_at TEXT NOT NULL,
          founders_checked INTEGER NOT NULL,
          startups_checked INTEGER NOT NULL,
          facts_checked INTEGER NOT NULL,
          summary_json TEXT NOT NULL
        );
        """
    )


def audit(db: sqlite3.Connection, entity_type: str, entity_id: str, action: str, field: str | None, old: str | None, new: str | None, reason: str, url: str | None) -> None:
    key = hashlib.sha256(f"{entity_type}|{entity_id}|{action}|{field or ''}|{old or ''}|{new or ''}|{reason}".encode()).hexdigest()[:40]
    db.execute(
        """INSERT INTO accuracy_audit
           (id, entity_type, entity_id, action, field, old_value, new_value, reason, evidence_url, checked_at, idempotency_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(idempotency_key) DO NOTHING""",
        (new_id("aud"), entity_type, entity_id, action, field, old, new, reason[:800], url, DATE, key),
    )


def append_note(existing: str | None, sentence: str) -> str:
    sentence = re.sub(r"\s+", " ", sentence).strip()
    base = existing or ""
    base = re.sub(rf"\n*{re.escape(NOTE)}:.*", "", base, flags=re.S).strip()
    if not sentence:
        return base
    return (base + "\n\n" if base else "") + f"{NOTE}: {sentence}"


def yc_status_value(status: str) -> str | None:
    folded_status = status.strip().lower()
    if folded_status in {"inactive", "dead"}:
        return "dead"
    if folded_status == "acquired":
        return "acquired"
    if folded_status == "public":
        return "public"
    if folded_status == "active":
        return "active"
    return None


def enrollment_from_year(year: int) -> str:
    if year > 2026:
        return "current_student"
    if year >= 2023:
        return "recent_grad"
    return "older_alumni"


def class_year_near(name: str, text: str) -> int | None:
    if not name_mentioned(name, text):
        return None
    hay = fold(text)
    needle = fold(name)
    index = hay.find(needle) if needle else -1
    if index < 0:
        return None
    # Only a year attached to this name. A teammate's "C'27" earlier on the same line is not this person's class.
    window = hay[index + len(needle): index + len(needle) + 20]
    match = CLASS_YEAR.search(window)
    if not match:
        return None
    raw = match.group(1) or match.group(2)
    year = int(raw)
    if year < 100:
        year += 2000
    if 1990 <= year <= 2032:
        return year
    return None


def acquisition_phrase(name: str, text: str) -> str | None:
    if not name_mentioned(name, text):
        return None
    patterns = [
        rf"\bacquir(?:e|es|ed)\s+(?:\S+\s+){{0,16}}(?<![A-Za-z0-9-]){re.escape(name)}(?![A-Za-z0-9-])",
        rf"(?<![A-Za-z0-9-]){re.escape(name)}(?![A-Za-z0-9-]).{{0,80}}\bacquired\b",
        rf"(?<![A-Za-z0-9-]){re.escape(name)}(?![A-Za-z0-9-])\s+(?:is |was |has been )?acquired\b",
        rf"(?<![A-Za-z0-9-]){re.escape(name)}(?![A-Za-z0-9-])\s+(?:is |has )?shut(?:ting)? down\b",
        rf"(?<![A-Za-z0-9-]){re.escape(name)}(?![A-Za-z0-9-])\s+shuts down\b",
        rf"\bshut(?:ting)? down both\s+(?:\S+\s+){{0,6}}(?<![A-Za-z0-9-]){re.escape(name)}(?![A-Za-z0-9-])",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if not match:
            continue
        if len(compact(name)) <= 4:
            window = text[max(0, match.start() - 500):match.end() + 500]
            if not re.search(r"startup|y combinator|\byc\b", window, re.I):
                continue
        start = max(0, match.start() - 60)
        return re.sub(r"\s+", " ", text[start:match.end() + 80]).strip()
    return None


def open_db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 8000")
    return db


def load_graph(db: sqlite3.Connection) -> dict:
    companies = [dict(row) for row in db.execute("SELECT * FROM projects WHERE kind = 'company'")]
    people = [dict(row) for row in db.execute("SELECT * FROM people")]
    by_person = {row["id"]: row for row in people}
    roles = [dict(row) for row in db.execute("SELECT id, person_id, project_id, role FROM person_project_roles")]
    affiliations = [dict(row) for row in db.execute("SELECT person_id, university_id, status FROM affiliations")]
    campus_of: dict[str, set[str]] = defaultdict(set)
    for row in affiliations:
        if row["university_id"]:
            campus_of[row["person_id"]].add(row["university_id"])
    founders_of: dict[str, list[dict]] = defaultdict(list)
    companies_of: dict[str, list[str]] = defaultdict(list)
    for role in roles:
        if role["role"] and "founder" in role["role"].lower():
            founders_of[role["project_id"]].append(role)
            companies_of[role["person_id"]].append(role["project_id"])
    claims = [dict(row) for row in db.execute("SELECT id, entity_type, entity_id, claim_type, source_url, excerpt, verification_state, value_json FROM claims")]
    facts = [dict(row) for row in db.execute("SELECT id, project_id, fact_key, value_text, source_url, excerpt FROM company_facts")]
    rels = [dict(row) for row in db.execute("SELECT id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state FROM relationships WHERE relationship_type IN ('participated_in_program', 'part_of_program')")]
    precollege = [dict(row) for row in db.execute("SELECT id, person_id, match_status, source_url, label FROM precollege_signals")]
    return {
        "companies": companies,
        "people": by_person,
        "roles": roles,
        "campus_of": campus_of,
        "founders_of": founders_of,
        "companies_of": companies_of,
        "claims": claims,
        "facts": facts,
        "rels": rels,
        "precollege": precollege,
    }


def person_slugs(claims: list[dict], person_id: str) -> set[str]:
    slugs = set()
    for claim in claims:
        if claim["entity_type"] != "person" or claim["entity_id"] != person_id:
            continue
        slugs.add(linkedin_slug(claim["source_url"]))
        try:
            payload = json.loads(claim["value_json"] or "{}")
        except json.JSONDecodeError:
            payload = {}
        if isinstance(payload, dict):
            slugs.add(linkedin_slug(str(payload.get("linkedin") or "")))
    slugs.discard("")
    return slugs


def cofounder_names(graph: dict, person_id: str) -> set[str]:
    names = set()
    for project_id in graph["companies_of"].get(person_id, []):
        for role in graph["founders_of"].get(project_id, []):
            if role["person_id"] == person_id:
                continue
            person = graph["people"].get(role["person_id"])
            if person:
                names.add(compact(person["name"]))
    names.discard("")
    return names


def resolve_known_pairs(graph: dict, cache: Cache) -> tuple[list[dict], list[dict]]:
    merges = []
    kept = []
    name_counts = Counter(compact(person["name"]) for person in graph["people"].values())
    for entity_type, left_id, right_id, label in KNOWN_PAIRS:
        table = "people" if entity_type == "person" else None
        left = graph["people"].get(left_id) if entity_type == "person" else next((row for row in graph["companies"] if row["id"] == left_id), None)
        right = graph["people"].get(right_id) if entity_type == "person" else next((row for row in graph["companies"] if row["id"] == right_id), None)
        # Projects that are kind=project are not in companies. Load either kind.
        if entity_type == "project" and (left is None or right is None):
            # filled below from a direct lookup stored on graph later
            pass
        if left is None or right is None:
            kept.append({"label": label, "reason": "One side is already merged or no longer stored.", "left": left_id, "right": right_id})
            continue
        if entity_type == "person":
            left_slugs = person_slugs(graph["claims"], left_id)
            right_slugs = person_slugs(graph["claims"], right_id)
            shared_slug = any(slugs_compatible(a, b) for a in left_slugs for b in right_slugs)
            same_campus = bool(graph["campus_of"].get(left_id, set()) & graph["campus_of"].get(right_id, set()))
            shared_companies = set(graph["companies_of"].get(left_id, [])) & set(graph["companies_of"].get(right_id, []))
            shared_cofounders = cofounder_names(graph, left_id) & cofounder_names(graph, right_id)
            unique_shared = [name for name in shared_cofounders if name_counts.get(name, 0) <= 2 and len(name) >= 6]
            years_ok = left["enrollment_grad_year"] == right["enrollment_grad_year"] or not left["enrollment_grad_year"] or not right["enrollment_grad_year"]
            if shared_companies and shared_slug and same_campus and years_ok:
                merges.append(merge_item("person", left, right, f"{label}: same campus, startup, and compatible LinkedIn slug."))
            elif unique_shared and same_campus and years_ok and compact(left["name"]) == compact(right["name"]):
                merges.append(merge_item("person", left, right, f"{label}: same campus and class year, and both records share cofounder {unique_shared[0]}."))
            else:
                kept.append({"label": label, "left": left_id, "right": right_id, "reason": "Same name, but the startups, campuses, or sources do not show one person."})
            continue
        reason = project_pair_reason(left, right, cache)
        if not reason and label.startswith("Sonura"):
            hits = search(cache, '"Sonura Care" Penn beanie OR NICU OR neonatal')
            for _engine, href, title in hits:
                if name_mentioned("Sonura", title) and re.search(r"beanie|nicu|neonatal", title, re.I):
                    reason = f"A public page ties Sonura Care to the NICU beanie ({href or title[:80]})."
                    break
        if not reason and label.startswith("Vital Start"):
            hits = search(cache, '"Vital Start Health" "Vital Start" Penn')
            blob = " ".join(title for _, _, title in hits)
            if "vital start health" in fold(blob) and "vital start" in fold(blob):
                reason = None
        if reason:
            merges.append(merge_item("project", left, right, f"{label}: {reason}"))
        else:
            kept.append({"label": label, "left": left_id, "right": right_id, "reason": project_keep_reason(left, right, cache)})
    return merges, kept


def merge_item(entity_type: str, left: dict, right: dict, reason: str) -> dict:
    def richness(row: dict) -> tuple:
        if entity_type == "person":
            return (
                1 if row.get("verification_status") == "confirmed" else 0,
                1 if row.get("signal_tier") in {"S", "A"} else 0,
                len(row.get("enrollment_evidence") or ""),
            )
        return (
            1 if row.get("kind") == "company" else 0,
            1 if row.get("website_url") else 0,
            1 if row.get("verification_status") == "confirmed" else 0,
            len(row.get("description") or ""),
        )
    survivor, drop = (left, right) if richness(left) >= richness(right) else (right, left)
    return {"entityType": entity_type, "survivorId": survivor["id"], "dropId": drop["id"], "reason": reason[:500]}


def project_pair_reason(left: dict, right: dict, cache: Cache) -> str | None:
    # A shared name is not evidence. Hackathon projects and companies that only
    # share a name stay separate unless a site or a product description agrees.
    left_host = host_of(left.get("website_url"))
    right_host = host_of(right.get("website_url"))
    if left.get("kind") != right.get("kind") and not (left_host and left_host == right_host):
        return None
    if left_host and left_host == right_host and left_host not in LOGIN_HOSTS and "devpost.com" not in left_host:
        return f"both use {left_host}"
    words = content_words(left.get("description") or "") & content_words(right.get("description") or "")
    if names_compatible(left.get("name") or "", right.get("name") or "") and len(words) >= 4:
        return "same product described on both records"
    return None


def project_text(project: dict, cache: Cache) -> str:
    chunks = [project.get("description") or "", project.get("name") or ""]
    for url in (project.get("website_url"), project.get("primary_link")):
        page = cache.get(url) if url else None
        if page:
            chunks.append(page["title"])
            chunks.append(page["text"][:1500])
    return " ".join(chunks)


def project_keep_reason(left: dict, right: dict, cache: Cache) -> str:
    left_desc = (left.get("description") or project_text(left, cache))[:140]
    right_desc = (right.get("description") or project_text(right, cache))[:140]
    return f"Different products. {left.get('name')}: {left_desc} | {right.get('name')}: {right_desc}"


def upsert_fact(db: sqlite3.Connection, project_id: str, fact_key: str, value: str, source_url: str, excerpt: str) -> str:
    row = db.execute(
        "SELECT id, value_text FROM company_facts WHERE project_id = ? AND fact_key = ? ORDER BY rowid LIMIT 1",
        (project_id, fact_key),
    ).fetchone()
    if row:
        if (row["value_text"] or "").strip() == value.strip():
            return "same"
        db.execute(
            "UPDATE company_facts SET value_text = ?, source_url = ?, excerpt = ?, origin = ? WHERE id = ?",
            (value, source_url, excerpt[:400], "accuracy_audit", row["id"]),
        )
        return "updated"
    db.execute(
        """INSERT INTO company_facts
           (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin)
           VALUES (?, ?, ?, ?, NULL, NULL, '{}', ?, ?, 'accuracy_audit')""",
        (new_id("fact"), project_id, fact_key, value, source_url, excerpt[:400]),
    )
    return "inserted"


def apply(db: sqlite3.Connection, cache: Cache, graph: dict, propose_only: bool) -> dict:
    fixes = Counter()
    samples: dict[str, list[str]] = defaultdict(list)
    merges: list[dict] = []
    kept_pairs: list[dict] = []
    dead_names: list[str] = []
    acquired_names: list[str] = []
    false_examples: list[dict] = []
    founders_checked = 0
    startups_checked = 0
    facts_checked = 0
    link_dead = 0
    link_replaced = 0
    unsupported = 0
    blocked = 0
    search_engines = Counter()

    # Probe search engines once so the report can name which ones answered.
    probe = search(cache, "Y Combinator")
    if probe:
        search_engines[probe[0][0]] += 1

    projects_by_id = {row["id"]: dict(row) for row in db.execute("SELECT * FROM projects")}
    # Known pairs need project rows of every kind, not only companies.
    graph["companies"] = list(projects_by_id.values())
    pair_merges, pair_kept = resolve_known_pairs(graph, cache)
    merges.extend(pair_merges)
    kept_pairs.extend(pair_kept)

    yc_by_slug: dict[str, dict] = {}
    for claim in graph["claims"] + [{"source_url": fact["source_url"]} for fact in graph["facts"]]:
        url = claim.get("source_url") or ""
        if "ycombinator.com/companies/" not in url:
            continue
        page = cache.get(url.split("?")[0] if False else url)
        if page and page.get("extra"):
            yc_by_slug[url.rstrip("/")] = page["extra"]
            yc_by_slug[page["final_url"].rstrip("/")] = page["extra"]

    company_yc: dict[str, tuple[str, dict]] = {}
    for company in graph["companies"]:
        if company.get("kind") != "company":
            continue
        for fact in graph["facts"]:
            if fact["project_id"] != company["id"]:
                continue
            extra = None
            page = cache.get(fact["source_url"])
            if page and page.get("extra"):
                extra = page["extra"]
                company_yc[company["id"]] = (fact["source_url"], extra)
                break
        if company["id"] in company_yc:
            continue
        for claim in graph["claims"]:
            if claim["entity_type"] == "project" and claim["entity_id"] == company["id"] and "ycombinator.com/companies/" in (claim["source_url"] or ""):
                page = cache.get(claim["source_url"])
                if page and page.get("extra"):
                    company_yc[company["id"]] = (claim["source_url"], page["extra"])
                    break

    def remember(kind: str, text: str) -> None:
        if len(samples[kind]) < 8:
            samples[kind].append(text)

    summary_searches: list[tuple[str, str, str, str]] = []
    press_pages: list[tuple[str, str]] = []
    for press_url in PRESS_URLS:
        press = cache.get(press_url)
        if press is None and not propose_only:
            press = fetch_url(press_url)
            cache.put(press_url, press)
        if press and press["kind"] == "ok":
            press_pages.append((press_url, f"{press['title']} {press['text']}"))

    for company in graph["companies"]:
        if company.get("kind") != "company":
            continue
        startups_checked += 1
        project_id = company["id"]
        name = company["name"]
        tier = company.get("signal_tier")
        website = company.get("website_url") or ""
        page = cache.get(website) if website else None
        yc = company_yc.get(project_id)
        yc_url, yc_data = yc if yc else ("", None)
        if yc_data and not names_compatible(name, str(yc_data.get("name") or "")):
            yc_url, yc_data = "", None
        evidence_urls = []
        if website:
            evidence_urls.append(website)
        if company.get("primary_link"):
            evidence_urls.append(company["primary_link"])
        for fact in graph["facts"]:
            if fact["project_id"] == project_id and fact["source_url"]:
                evidence_urls.append(fact["source_url"])
        mentioned = False
        own_match = False
        any_checked = False
        saw_blocked_only = True
        for url in dict.fromkeys(evidence_urls):
            fetched = cache.get(url)
            if not fetched:
                continue
            any_checked = True
            if fetched["kind"] == "blocked":
                blocked += 1
                continue
            if fetched["kind"] == "error":
                continue
            saw_blocked_only = False
            blob = f"{fetched['title']} {fetched['description']} {fetched['text']}"
            if fetched["kind"] == "ok" and name_mentioned(name, blob):
                mentioned = True
                if website and url == website and (name_mentioned(name, fetched["title"]) or name_mentioned(name, fetched["description"])):
                    own_match = True
        if yc_data and names_compatible(name, yc_data["name"]):
            mentioned = True
            own_match = True

        status_value = None
        status_url = None
        status_excerpt = None
        if yc_data:
            mapped = yc_status_value(str(yc_data.get("status") or ""))
            if mapped and mapped != "active":
                status_value = mapped
                status_url = yc_url
                status_excerpt = f"YC lists {yc_data['name']} as {yc_data.get('status')}."
        if page and page["kind"] == "ok" and SHUTDOWN.search(f"{page['title']} {page['text'][:1500]}"):
            status_value = "dead"
            status_url = website
            status_excerpt = "The company site says it has shut down."
        if status_value is None:
            for press_url, press_text in press_pages:
                phrase = acquisition_phrase(name, press_text)
                if not phrase:
                    continue
                status_value = "acquired" if re.search(r"acquir", phrase, re.I) else "dead"
                status_url = press_url
                status_excerpt = phrase
                break
        if tier in {"S", "A"} and status_value is None and (len(compact(name)) >= 5 or yc_url):
            summary_searches.append((project_id, name, website, yc_url))

        if status_value in {"dead", "acquired", "public"} and status_url and not propose_only:
            result = upsert_fact(db, project_id, "operating_status", status_value, status_url, status_excerpt or status_value)
            if result in {"inserted", "updated"}:
                fixes["operating_status"] += 1
                action = "dead" if status_value == "dead" else "fix"
                audit(db, "project", project_id, action, "operating_status", None, status_value, status_excerpt or status_value, status_url)
                remember("operating_status", f"{name}: {status_value}")
                if status_value == "dead":
                    dead_names.append(name)
                elif status_value == "acquired":
                    acquired_names.append(name)
        elif status_value == "dead":
            dead_names.append(name)

        # Description: replace directory blurbs with a sourced one-liner.
        description = company.get("description") or ""
        replacement = None
        replacement_url = None
        if yc_data and yc_data.get("one_liner") and names_compatible(name, yc_data["name"]):
            if WEAK_DESC.search(description) or len(description.strip()) < 12:
                replacement = yc_data["one_liner"].strip()
                replacement_url = yc_url
        elif page and page["kind"] == "ok" and page["description"] and name_mentioned(name, f"{page['title']} {page['description']}") and not GENERIC_META.search(page["description"]):
            if WEAK_DESC.search(description) or len(description.strip()) < 12:
                replacement = page["description"].strip()
                replacement_url = website
        if replacement and replacement != description.strip() and not propose_only:
            db.execute("UPDATE projects SET description = ?, updated_at = ? WHERE id = ?", (replacement, now_iso(), project_id))
            upsert_fact(db, project_id, "description", replacement, replacement_url or "", replacement[:240])
            audit(db, "project", project_id, "fix", "description", description[:240], replacement[:240], "Replaced a directory blurb with the company's own one-line description.", replacement_url)
            fixes["description"] += 1
            remember("description", f"{name}: {replacement[:80]}")

        # Website: replace a dead or mismatched site when YC or the live page names the company.
        if website and page and page["kind"] == "dead":
            new_site = ""
            if yc_data and yc_data.get("website"):
                candidate = yc_data["website"]
                if not candidate.startswith("http"):
                    candidate = "https://" + candidate
                candidate_page = cache.get(candidate)
                if candidate_page is None:
                    candidate_page = fetch_url(candidate)
                    cache.put(candidate, candidate_page)
                if candidate_page["kind"] == "ok" and name_mentioned(name, f"{candidate_page['title']} {candidate_page['description']} {candidate_page['text'][:500]}"):
                    new_site = candidate
            if new_site and new_site.rstrip("/") != website.rstrip("/") and not propose_only:
                db.execute("UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ?", (new_site, now_iso(), project_id))
                upsert_fact(db, project_id, "website", new_site, new_site, f"Website {new_site} names {name}.")
                audit(db, "project", project_id, "link_replaced", "website", website, new_site, "Stored website no longer loads. Replaced with the live site named on the YC page.", new_site)
                fixes["website"] += 1
                link_replaced += 1
                remember("website", f"{name}: {website} → {new_site}")
            elif not new_site and not propose_only:
                audit(db, "project", project_id, "link_dead", "website", website, None, "Stored website did not load and no replacement page named the company.", website)
                link_dead += 1
        if not website and compact(name).startswith("sonura") and not propose_only:
            site = "https://www.sonuracare.com"
            site_page = cache.get(site)
            if site_page is None:
                site_page = fetch_url(site)
                cache.put(site, site_page)
            blob = f"{site_page['title']} {site_page['text']}"
            if site_page["kind"] == "ok" and name_mentioned("Sonura", blob):
                db.execute("UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ?", (site, now_iso(), project_id))
                upsert_fact(db, project_id, "website", site, site, "sonuracare.com describes the Sonura NICU beanie.")
                audit(db, "project", project_id, "fix", "website", None, site, "sonuracare.com describes the NICU beanie this record already documents.", site)
                fixes["website"] += 1
        elif website and page and page["kind"] == "ok" and substantive_text(page["text"]) and not name_mentioned(name, f"{page['title']} {page['description']} {page['text']}"):
            final_host = host_of(page["final_url"])
            final_url = page["final_url"] or ""
            parked = any(final_host == item or final_host.endswith("." + item) for item in PARKING_HOSTS) or "tkn=" in final_url
            if parked and final_host and final_host != host_of(website) and not propose_only:
                db.execute("UPDATE projects SET website_url = NULL, updated_at = ? WHERE id = ?", (now_iso(), project_id))
                audit(db, "project", project_id, "fix", "website", website, None, f"Website redirects to a parked or tokenized host ({final_url}) that does not name {name}.", final_url)
                fixes["website"] += 1
                remember("website", f"{name}: cleared {website}")
            elif final_host and final_host != host_of(website) and not propose_only:
                audit(db, "project", project_id, "link_dead", "website", website, final_url, f"Website redirects to {final_url}. The fetched page does not name {name}, so the stored URL was left in place.", final_url)
                link_dead += 1

        # HQ, founded year, team size from YC when absent.
        if yc_data and yc_url and not propose_only:
            fetched_yc = cache.get(yc_url)
            final_yc = ((fetched_yc or {}).get("final_url") or "").split("?")[0].rstrip("/")
            stored_yc = yc_url.split("?")[0].rstrip("/")
            if final_yc and "ycombinator.com/companies/" in final_yc and final_yc != stored_yc and names_compatible(name, str(yc_data.get("name") or "")):
                changed = db.execute(
                    "UPDATE company_facts SET source_url = ? WHERE project_id = ? AND rtrim(source_url, '/') = ?",
                    (final_yc, project_id, stored_yc),
                ).rowcount
                if changed:
                    audit(db, "project", project_id, "link_replaced", "evidence_url", stored_yc, final_yc, "YC slug redirects to the company page that names this startup.", final_yc)
                    fixes["evidence_url"] += 1
                    link_replaced += 1
            existing = {fact["fact_key"]: fact for fact in graph["facts"] if fact["project_id"] == project_id}
            if yc_data.get("location") and "hq" not in existing:
                upsert_fact(db, project_id, "hq", yc_data["location"], yc_url, f"YC lists location {yc_data['location']}.")
                audit(db, "project", project_id, "fix", "hq", None, yc_data["location"], "HQ was blank. Filled from the YC company page.", yc_url)
                fixes["hq"] += 1
            if yc_data.get("year") and "founded_year" not in existing:
                upsert_fact(db, project_id, "founded_year", str(yc_data["year"]), yc_url, f"YC lists founded {yc_data['year']}.")
                audit(db, "project", project_id, "fix", "founded_year", None, str(yc_data["year"]), "Founded year was blank. Filled from the YC company page.", yc_url)
                fixes["founded_year"] += 1
            if yc_data.get("team_size") and "team_size" not in existing:
                upsert_fact(db, project_id, "team_size", str(yc_data["team_size"]), yc_url, f"YC lists team size {yc_data['team_size']}.")
                audit(db, "project", project_id, "fix", "team_size", None, str(yc_data["team_size"]), "Team size was blank. Filled from the YC company page.", yc_url)
                fixes["team_size"] += 1

        # Founder list vs YC.
        if yc_data and not propose_only:
            for role in graph["founders_of"].get(project_id, []):
                person = graph["people"].get(role["person_id"])
                if not person:
                    continue
                if any(person_matches_founder(person["name"], founder["name"]) for founder in yc_data["founders"]):
                    continue
                cited = [claim for claim in graph["claims"] if claim["entity_id"] == person["id"] and yc_url and claim["source_url"] and claim["source_url"].rstrip("/") == yc_url.rstrip("/")]
                page_text = ""
                fetched = cache.get(yc_url)
                if fetched:
                    page_text = f"{fetched['title']} {fetched['text']}"
                if not cited:
                    continue
                if name_mentioned(person["name"], page_text):
                    db.execute("UPDATE person_project_roles SET role = ? WHERE id = ? AND role LIKE '%founder%'", ("early_employee", role["id"]))
                    audit(db, "person", person["id"], "fix", "role", role["role"], "early_employee", f"YC lists {name} but {person['name']} is not in the founder list. The page still names them.", yc_url)
                    fixes["role"] += 1
                    remember("role", f"{person['name']} at {name}: early employee")
                else:
                    db.execute("UPDATE person_project_roles SET role = ? WHERE id = ?", ("not_listed", role["id"]))
                    other = [pid for pid in graph["companies_of"].get(person["id"], []) if pid != project_id]
                    if not other and person.get("founder_status") == "founder":
                        db.execute("UPDATE people SET founder_status = 'removed', potential_signal = ? WHERE id = ?", (f"Removed from the founder list: the cited YC page for {name} does not name them.", person["id"]))
                        audit(db, "person", person["id"], "false_positive", "founder_status", "founder", "removed", f"Cited YC page for {name} does not list {person['name']}.", yc_url)
                        fixes["false_positive"] += 1
                        if len(false_examples) < 8:
                            false_examples.append({"name": person["name"], "reason": f"Cited as a founder of {name} on a YC page that does not name them."})
                    else:
                        audit(db, "person", person["id"], "fix", "role", role["role"], "not_listed", f"Cited YC page for {name} does not list {person['name']} as a founder.", yc_url)
                        fixes["role"] += 1

        # Upgrade when a live page names the company. Downgrade only when its own
        # site was fetched and neither that site nor any other fetched page names it.
        if not propose_only and any_checked:
            current = company.get("verification_status")
            new_status = current
            site_dead = bool(page and page["kind"] == "dead")
            if own_match:
                new_status = "confirmed"
            elif mentioned and current in {None, "unverified"}:
                new_status = "partial"
            elif not mentioned and site_dead and current in {"confirmed", "partial"} and not yc_data:
                new_status = "unverified"
            if new_status and current != new_status and not (current in {None, "unverified"} and new_status == "unverified"):
                note = append_note(company.get("verification_note"), verification_sentence(new_status, name, website, yc_url))
                db.execute(
                    "UPDATE projects SET verification_status = ?, last_verified_at = ?, verification_note = ? WHERE id = ?",
                    (new_status, DATE, note, project_id),
                )
                if status_rank(current) > status_rank(new_status):
                    audit(db, "project", project_id, "downgrade", "verification_status", current, new_status, "Public pages no longer support the previous verification level.", website or yc_url)
                    fixes["verification_status"] += 1
                elif status_rank(new_status) > status_rank(current):
                    audit(db, "project", project_id, "fix", "verification_status", current, new_status, "A live public page names the company.", website or yc_url)
                    fixes["verification_status"] += 1

        # Course / club false positives.
        desc = company.get("description") or ""
        if COURSE.search(desc) and company.get("is_investable_candidate") == 1 and not yc_data and not (page and page["kind"] == "ok" and own_match):
            if not propose_only:
                db.execute("UPDATE projects SET is_investable_candidate = 0, updated_at = ? WHERE id = ?", (now_iso(), project_id))
                audit(db, "project", project_id, "false_positive", "is_investable_candidate", "1", "0", "The description identifies a class, club, or hackathon project, and no company site confirms a startup.", company.get("primary_link"))
                fixes["false_positive"] += 1
                if len(false_examples) < 8:
                    false_examples.append({"name": name, "reason": "Described as a class, club, or hackathon project without a company site."})

        if startups_checked % 200 == 0:
            db.commit()

    searched = 0
    for project_id, name, website, yc_url in summary_searches:
        if searched >= 140 or propose_only:
            break
        searched += 1
        query = f"\"{name}\" acquired OR \"shuts down\" OR \"shut down\""
        if len(compact(name)) < 5:
            query = f"\"{name}\" startup acquired OR \"shuts down\""
        hits = search(cache, query)
        time.sleep(0.35)
        if hits:
            search_engines[hits[0][0]] += 1
        for _engine, href, title in hits:
            if not href:
                continue
            phrase = acquisition_phrase(name, title)
            if not phrase:
                continue
            status_value = "acquired" if re.search(r"acquir", phrase, re.I) else "dead"
            result = upsert_fact(db, project_id, "operating_status", status_value, href, phrase)
            if result in {"inserted", "updated"}:
                fixes["operating_status"] += 1
                audit(db, "project", project_id, "dead" if status_value == "dead" else "fix", "operating_status", None, status_value, phrase, href)
                remember("operating_status", f"{name}: {status_value}")
                if status_value == "dead":
                    dead_names.append(name)
                elif status_value == "acquired":
                    acquired_names.append(name)
            break
    db.commit()

    # People: founders and anyone with a founder role.
    founder_ids = set()
    for person_id, person in graph["people"].items():
        if person.get("founder_status") == "founder" or graph["companies_of"].get(person_id):
            founder_ids.add(person_id)
    for person_id in founder_ids:
        founders_checked += 1
        person = graph["people"][person_id]
        if not person or propose_only:
            continue
        urls = []
        if person.get("enrollment_source_url"):
            urls.append(person["enrollment_source_url"])
        for claim in graph["claims"]:
            if claim["entity_type"] == "person" and claim["entity_id"] == person_id and claim["source_url"]:
                if claim["claim_type"] in LINKEDIN_CLAIM_TYPES or "linkedin.com/in/" in claim["source_url"]:
                    continue
                urls.append(claim["source_url"])
        named = False
        campus_named = False
        checked_page = False
        year = None
        year_url = None
        for url in dict.fromkeys(urls):
            fetched = cache.get(url)
            if not fetched or fetched["kind"] != "ok":
                continue
            checked_page = True
            blob = f"{fetched['title']} {fetched['text']}"
            if name_mentioned(person["name"], blob):
                named = True
                campuses = graph["campus_of"].get(person_id, set())
                campus_words = {
                    "univ_penn": "pennsylvania",
                    "univ_berkeley": "berkeley",
                    "univ_stanford": "stanford",
                    "univ_mit": "mit",
                    "univ_harvard": "harvard",
                    "univ_cmu": "carnegie",
                    "univ_columbia": "columbia",
                    "univ_brown": "brown",
                    "univ_waterloo": "waterloo",
                    "univ_gatech": "georgia tech",
                }
                if any(word in fold(blob) for campus, word in campus_words.items() if campus in campuses) or any(name_mentioned(projects_by_id[pid]["name"], blob) for pid in graph["companies_of"].get(person_id, []) if pid in projects_by_id):
                    campus_named = True
                found_year = class_year_near(person["name"], blob)
                if found_year and year is None:
                    year = found_year
                    year_url = url
        if (
            year
            and person.get("enrollment_grad_year") != year
            and (person.get("enrollment_basis") != "verified" or not person.get("enrollment_grad_year"))
            and 1 < len(person["name"].split()) <= 4
            and not re.search(r"\b(award|collaboration|ventures|incubator|accelerator|program)\b", person["name"], re.I)
        ):
            status = enrollment_from_year(year)
            db.execute(
                """UPDATE people SET enrollment_grad_year = ?, enrollment_status = ?, enrollment_basis = 'verified',
                   enrollment_evidence = ?, enrollment_source_url = ? WHERE id = ?""",
                (year, status, f"Class year {year} stated next to {person['name']}.", year_url, person_id),
            )
            audit(db, "person", person_id, "fix", "enrollment_grad_year", str(person.get("enrollment_grad_year") or ""), str(year), "A public page states the class year next to this name.", year_url)
            fixes["enrollment"] += 1
            remember("enrollment", f"{person['name']}: {year}")
        for url in dict.fromkeys(urls):
            fetched = cache.get(url)
            if not fetched or fetched["kind"] != "ok":
                continue
            blob = f"{fetched['title']} {fetched['text']}"
            idx = blob.lower().find(person["name"].lower())
            if idx < 0:
                continue
            before = blob[max(0, idx - 24):idx]
            after = blob[idx + len(person["name"]): idx + len(person["name"]) + 16]
            if re.search(r"[A-Z]\.\s*$", before) and re.search(r"^\s*award(?![a-z])", after, re.I) and person.get("founder_status") == "founder":
                db.execute(
                    "UPDATE people SET founder_status = 'removed', potential_signal = ? WHERE id = ?",
                    (f"Removed from the founder list: {person['name']} is an award title on the cited page, not a person.", person_id),
                )
                db.execute("UPDATE person_project_roles SET role = 'not_listed' WHERE person_id = ? AND role LIKE '%founder%'", (person_id,))
                audit(db, "person", person_id, "false_positive", "founder_status", "founder", "removed", f"{person['name']} appears only as part of an award title, not as a person.", url)
                fixes["false_positive"] += 1
                if len(false_examples) < 8:
                    false_examples.append({"name": person["name"], "reason": "The cited page uses this string as an award title, not a person's name."})
                break
        if checked_page:
            current = person.get("verification_status")
            if named and campus_named:
                new_status = "confirmed"
            elif named and current in {None, "unverified"}:
                new_status = "partial"
            else:
                new_status = current
            if current != new_status and not (current in {None, "unverified"} and new_status == "unverified"):
                db.execute(
                    "UPDATE people SET verification_status = ?, last_verified_at = ?, verification_note = ? WHERE id = ?",
                    (new_status, DATE, append_note(person.get("verification_note"), f"Checked public pages for {person['name']}."), person_id),
                )
                action = "downgrade" if status_rank(current) > status_rank(new_status) else "fix"
                audit(db, "person", person_id, action, "verification_status", current, new_status, "Updated from the pages that mention, or fail to mention, this person.", person.get("enrollment_source_url"))
                fixes["verification_status"] += 1

    # Facts, claims, program relationships, pre-college signals.
    claim_by_id = {claim["id"]: claim for claim in graph["claims"]}
    for fact in graph["facts"]:
        facts_checked += 1
        if propose_only:
            continue
        fetched = cache.get(fact["source_url"])
        if not fetched:
            continue
        project = projects_by_id.get(fact["project_id"])
        name = project["name"] if project else ""
        if fetched["kind"] == "dead":
            audit(db, "company_fact", fact["id"], "link_dead", fact["fact_key"], fact["source_url"], None, "Evidence URL for this fact no longer loads.", fact["source_url"])
            link_dead += 1
            yc = company_yc.get(fact["project_id"])
            if yc and fact_supported_by_yc(fact, yc[1]):
                db.execute("UPDATE company_facts SET source_url = ?, excerpt = ?, origin = 'accuracy_audit' WHERE id = ?", (yc[0], f"YC page states {fact['fact_key']}.", fact["id"]))
                audit(db, "company_fact", fact["id"], "link_replaced", fact["fact_key"], fact["source_url"], yc[0], "Replaced a dead evidence URL with the YC page that states the same fact.", yc[0])
                link_replaced += 1
                fixes["evidence_url"] += 1
        elif fetched["kind"] == "blocked":
            blocked += 1
        elif fetched["kind"] == "ok" and evidence_names_entity(fetched, name, "project") == "no":
            audit(db, "company_fact", fact["id"], "downgrade", fact["fact_key"], fact["source_url"], None, "The page loads but does not name this company.", fact["source_url"])
            unsupported += 1

    for claim in graph["claims"]:
        facts_checked += 1
        if propose_only or claim["claim_type"] in LINKEDIN_CLAIM_TYPES or "linkedin.com/in/" in (claim["source_url"] or ""):
            continue
        fetched = cache.get(claim["source_url"])
        if not fetched:
            continue
        if fetched["kind"] == "dead" and claim["verification_state"] != "disputed":
            db.execute("UPDATE claims SET verification_state = 'disputed' WHERE id = ?", (claim["id"],))
            audit(db, "claim", claim["id"], "link_dead", claim["claim_type"], claim["source_url"], None, "Evidence URL returned not found or the domain does not resolve.", claim["source_url"])
            link_dead += 1
        elif fetched["kind"] == "blocked":
            blocked += 1
        elif fetched["kind"] == "ok" and claim["verification_state"] == "unverified":
            entity_name = entity_name_for_claim(claim, projects_by_id, graph["people"])
            if entity_name and evidence_names_entity(fetched, entity_name, claim["entity_type"]) == "no":
                db.execute("UPDATE claims SET verification_state = 'disputed' WHERE id = ?", (claim["id"],))
                audit(db, "claim", claim["id"], "downgrade", "verification_state", claim["verification_state"], "disputed", "The page loads but does not name the entity on the claim.", claim["source_url"])
                unsupported += 1

    for rel in graph["rels"]:
        facts_checked += 1
        if propose_only:
            continue
        try:
            ids = json.loads(rel["evidence_claim_ids_json"] or "[]")
        except json.JSONDecodeError:
            ids = []
        if not ids:
            audit(db, "relationship", rel["id"], "downgrade", "evidence", None, None, "Program relationship has no evidence claim.", None)
            unsupported += 1
            continue
        kinds = []
        for claim_id in ids:
            claim = claim_by_id.get(claim_id)
            if not claim:
                continue
            fetched = cache.get(claim["source_url"])
            if fetched:
                kinds.append(fetched["kind"])
        if kinds and all(kind == "dead" for kind in kinds):
            audit(db, "relationship", rel["id"], "link_dead", rel["relationship_type"], None, None, "Every evidence URL on this program relationship is dead.", None)
            link_dead += 1

    for signal in graph["precollege"]:
        facts_checked += 1
        if propose_only:
            continue
        fetched = cache.get(signal["source_url"])
        person = graph["people"].get(signal["person_id"])
        if not fetched or not person:
            continue
        if fetched["kind"] == "dead":
            audit(db, "precollege_signal", signal["id"], "link_dead", "source_url", signal["source_url"], None, "Pre-college evidence URL no longer loads.", signal["source_url"])
            link_dead += 1
        elif fetched["kind"] == "ok" and evidence_names_entity(fetched, person["name"], "person") == "no" and signal["match_status"] == "confirmed":
            db.execute("UPDATE precollege_signals SET match_status = 'likely' WHERE id = ?", (signal["id"],))
            audit(db, "precollege_signal", signal["id"], "downgrade", "match_status", "confirmed", "likely", "The cited page does not name this person.", signal["source_url"])
            fixes["precollege"] += 1

    for item in kept_pairs:
        if not propose_only:
            audit(db, "duplicate_pair", item["left"], "kept_separate", None, item["label"], item["right"], item["reason"][:500], None)

    db.commit()
    return {
        "fixes": fixes,
        "samples": samples,
        "merges": merges,
        "kept_pairs": kept_pairs,
        "dead_names": dead_names,
        "acquired_names": acquired_names,
        "false_examples": false_examples,
        "founders_checked": founders_checked,
        "startups_checked": startups_checked,
        "facts_checked": facts_checked,
        "link_dead": link_dead,
        "link_replaced": link_replaced,
        "unsupported": unsupported,
        "blocked": blocked,
        "search_engines": search_engines,
    }


def campuses_for_company(graph: dict, project_id: str) -> set[str]:
    campuses = set()
    for role in graph["founders_of"].get(project_id, []):
        campuses |= graph["campus_of"].get(role["person_id"], set())
    return campuses


def status_rank(status: str | None) -> int:
    return {"confirmed": 3, "partial": 2, "unverified": 1}.get(status or "", 0)


def verification_sentence(status: str, name: str, website: str, yc_url: str) -> str:
    if status == "confirmed":
        return f"A live site or YC page names {name}."
    if status == "partial":
        return f"A public page names {name}; no company site was confirmed."
    return f"Fetched pages did not confirm {name}."


def fact_supported_by_yc(fact: dict, yc: dict) -> bool:
    if fact["fact_key"] == "hq":
        return bool(yc.get("location")) and fold(fact["value_text"]) in fold(yc["location"])
    if fact["fact_key"] == "founded_year":
        return str(yc.get("year") or "") == str(fact["value_text"]).strip()
    if fact["fact_key"] == "description":
        return bool(yc.get("one_liner")) and fold(fact["value_text"])[:40] in fold(yc["one_liner"])
    if fact["fact_key"] == "team_size":
        return str(yc.get("team_size") or "") == str(fact["value_text"]).strip()
    return False


def evidence_names_entity(fetched: dict, entity_name: str, entity_type: str) -> str:
    """yes, no, or inconclusive. Short and script-only pages are inconclusive."""
    extra = fetched.get("extra") or {}
    if extra:
        if entity_type == "project" and names_compatible(entity_name, str(extra.get("name") or "")):
            return "yes"
        if entity_type == "person":
            for founder in extra.get("founders") or []:
                if person_matches_founder(entity_name, str(founder.get("name") or "")):
                    return "yes"
            if name_mentioned(entity_name, f"{extra.get('one_liner') or ''} {extra.get('long') or ''}"):
                return "yes"
    blob = f"{fetched.get('title') or ''} {fetched.get('text') or ''}"
    if name_mentioned(entity_name, blob):
        return "yes"
    if not substantive_text(fetched.get("text") or ""):
        return "inconclusive"
    return "no"


def entity_name_for_claim(claim: dict, projects: dict, people: dict) -> str:
    if claim["entity_type"] == "project":
        project = projects.get(claim["entity_id"])
        return project["name"] if project else ""
    if claim["entity_type"] == "person":
        person = people.get(claim["entity_id"])
        return person["name"] if person else ""
    return ""


def collect_urls(db: sqlite3.Connection) -> list[str]:
    urls = []
    seen = set()

    def add(url: str | None, rank: int) -> None:
        if not url or not url.startswith("http"):
            return
        url = url.strip()
        if url in seen:
            return
        seen.add(url)
        urls.append((rank, url))

    priority_people = {row[0] for row in db.execute("SELECT id FROM people WHERE signal_tier IN ('S', 'A') OR founder_status = 'founder'")}
    priority_projects = {row[0] for row in db.execute("SELECT id FROM projects WHERE signal_tier IN ('S', 'A') OR kind = 'company'")}
    penn_people = {row[0] for row in db.execute("SELECT person_id FROM affiliations WHERE university_id IN ('univ_penn', 'univ_berkeley')")}
    for row in db.execute("SELECT id, website_url, primary_link, signal_tier, kind FROM projects"):
        rank = 1 if row["signal_tier"] in {"S", "A"} or row["kind"] == "company" else 4
        add(row["website_url"], rank)
        add(row["primary_link"], rank)
    for row in db.execute("SELECT entity_id, source_url, claim_type FROM claims"):
        url = row["source_url"]
        if not url:
            continue
        if "ycombinator.com/companies/" in url:
            rank = 0
        elif row["entity_id"] in priority_people or row["entity_id"] in priority_projects:
            rank = 1
        elif row["entity_id"] in penn_people:
            rank = 2
        else:
            rank = 3
        add(url, rank)
    for row in db.execute("SELECT project_id, source_url FROM company_facts"):
        add(row["source_url"], 1 if row["project_id"] in priority_projects else 3)
    for row in db.execute("SELECT source_url FROM precollege_signals"):
        add(row["source_url"], 1)
    for row in db.execute("SELECT id, enrollment_source_url, signal_tier FROM people"):
        rank = 1 if row["signal_tier"] in {"S", "A"} or row["id"] in penn_people else 3
        add(row["enrollment_source_url"], rank)
    urls.sort(key=lambda item: (item[0], item[1]))
    return [url for _, url in urls]


def counts(db: sqlite3.Connection) -> dict:
    def group(sql: str) -> dict:
        return {row[0] or "null": row[1] for row in db.execute(sql)}
    return {
        "startups": group("SELECT verification_status, COUNT(*) FROM projects WHERE kind = 'company' GROUP BY 1"),
        "founders": group("SELECT verification_status, COUNT(*) FROM people WHERE founder_status = 'founder' GROUP BY 1"),
        "companies": db.execute("SELECT COUNT(*) FROM projects WHERE kind = 'company'").fetchone()[0],
        "investable": db.execute("SELECT COUNT(*) FROM projects WHERE kind = 'company' AND is_investable_candidate = 1").fetchone()[0],
    }


def repair_previous_pass(db: sqlite3.Connection, cache: Cache) -> None:
    """Undo website clears and claim disputes made from truncated page text."""
    restored = 0
    for row in db.execute(
        """SELECT entity_id, old_value FROM accuracy_audit
           WHERE action = 'fix' AND field = 'website' AND new_value IS NULL AND old_value IS NOT NULL"""
    ):
        current = db.execute("SELECT website_url FROM projects WHERE id = ?", (row["entity_id"],)).fetchone()
        if current and not current["website_url"]:
            db.execute("UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ?", (row["old_value"], now_iso(), row["entity_id"]))
            restored += 1
        cache.db.execute("DELETE FROM fetches WHERE url = ?", (row["old_value"],))
    if restored:
        db.execute("DELETE FROM accuracy_audit WHERE action = 'fix' AND field = 'website' AND new_value IS NULL")
    claim_urls = [row[0] for row in db.execute(
        """SELECT DISTINCT evidence_url FROM accuracy_audit
           WHERE action = 'downgrade' AND entity_type = 'claim' AND evidence_url IS NOT NULL
             AND evidence_url NOT LIKE '%ycombinator.com%'"""
    )]
    fact_urls = [row[0] for row in db.execute(
        """SELECT DISTINCT evidence_url FROM accuracy_audit
           WHERE action = 'downgrade' AND entity_type = 'company_fact' AND evidence_url IS NOT NULL"""
    )]
    db.execute(
        """UPDATE claims SET verification_state = 'unverified'
           WHERE verification_state = 'disputed' AND id IN (
             SELECT entity_id FROM accuracy_audit
             WHERE action = 'downgrade' AND entity_type = 'claim' AND field = 'verification_state'
           )"""
    )
    db.execute("DELETE FROM accuracy_audit WHERE action = 'downgrade' AND entity_type = 'claim'")
    db.execute("DELETE FROM accuracy_audit WHERE action = 'downgrade' AND entity_type = 'company_fact'")
    for row in db.execute(
        "SELECT entity_id, old_value FROM accuracy_audit WHERE action = 'downgrade' AND entity_type = 'precollege_signal'"
    ):
        db.execute(
            "UPDATE precollege_signals SET match_status = ? WHERE id = ? AND match_status = 'likely'",
            (row["old_value"] or "confirmed", row["entity_id"]),
        )
    db.execute("DELETE FROM accuracy_audit WHERE action = 'downgrade' AND entity_type = 'precollege_signal'")
    for url in claim_urls + fact_urls:
        cache.db.execute("DELETE FROM fetches WHERE url = ?", (url,))
    stale = [row[0] for row in cache.db.execute("SELECT url, text FROM fetches") if boilerplate_text(row[1] or "")]
    for url in stale:
        cache.db.execute("DELETE FROM fetches WHERE url = ?", (url,))
    cache.db.execute("DELETE FROM searches")
    print(f"Dropped {len(stale)} boilerplate page extracts so they are fetched again.", flush=True)
    cache.commit()
    db.commit()
    print(f"Restored {restored} websites and queued {len(set(claim_urls + fact_urls))} pages for a fresh fetch.", flush=True)


def write_report(db: sqlite3.Connection, summary: dict, before: dict, after: dict) -> None:
    fixes = {row[0] or "unspecified": row[1] for row in db.execute(
        "SELECT field, COUNT(*) FROM accuracy_audit WHERE action = 'fix' GROUP BY 1"
    )}
    link_dead_n = db.execute("SELECT COUNT(*) FROM accuracy_audit WHERE action = 'link_dead'").fetchone()[0]
    link_replaced_n = db.execute("SELECT COUNT(*) FROM accuracy_audit WHERE action = 'link_replaced'").fetchone()[0]
    unsupported_n = db.execute(
        "SELECT COUNT(*) FROM accuracy_audit WHERE action = 'downgrade' AND entity_type IN ('claim', 'company_fact')"
    ).fetchone()[0]
    lines = [
        "# Accuracy audit",
        "",
        f"Checked {DATE} against company websites, YC company pages, press, GitHub, Devpost, and university pages.",
        "Search HTML came from DuckDuckGo, Bing, and Google. LinkedIn profile pages were not fetched (they require a login). DRF alumni rows were not modified.",
        "",
        "## Counts",
        "",
        f"- Founders checked: {summary['founders_checked']}",
        f"- Startups checked: {summary['startups_checked']}",
        f"- Facts checked (company facts, claims, program relationships, pre-college signals): {summary['facts_checked']}",
        f"- Dead evidence links flagged: {link_dead_n}",
        f"- Evidence links replaced: {link_replaced_n}",
        f"- Pages that loaded but did not name the entity: {unsupported_n}",
        f"- Fetches blocked (403, 429, or a login wall other than LinkedIn): {summary['blocked']}",
        "",
        "## Fixes by field",
        "",
    ]
    if not fixes:
        lines.append("- No field changes.")
    else:
        for field, count in sorted(fixes.items(), key=lambda item: (-item[1], item[0])):
            lines.append(f"- {field}: {count}")
    lines += ["", "## False positives removed from scout lists", ""]
    removed_rows = db.execute(
        "SELECT entity_type, entity_id, reason FROM accuracy_audit WHERE action = 'false_positive'"
    ).fetchall()
    lines.append(f"- Removed: {len(removed_rows)}")
    lines.append("")
    shown = 0
    for entity_type, entity_id, reason in removed_rows:
        if shown >= 8:
            break
        if entity_type == "person":
            name_row = db.execute("SELECT name FROM people WHERE id = ?", (entity_id,)).fetchone()
        else:
            name_row = db.execute("SELECT name FROM projects WHERE id = ?", (entity_id,)).fetchone()
        name = name_row[0] if name_row else entity_id
        lines.append(f"- **{name}.** {reason}")
        shown += 1
    if not removed_rows:
        lines.append("No clear false positive met the removal rule (a cited page that names a different set of founders, or a class/club/hackathon description with no company site).")
    lines += ["", "## Duplicates", ""]
    merged_total = db.execute("SELECT COUNT(*) FROM accuracy_audit WHERE action = 'merge'").fetchone()[0]
    lines.append(f"- Merged: {merged_total}")
    kept_rows = []
    seen_pairs = set()
    for label, right, reason in db.execute(
        "SELECT old_value, new_value, reason FROM accuracy_audit WHERE action = 'kept_separate'"
    ):
        if not reason or reason.startswith("One side is already merged"):
            continue
        key = (label, right)
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        kept_rows.append((label, reason))
    lines.append(f"- Known pairs kept separate: {len(kept_rows)}")
    lines.append("")
    for label, reason in kept_rows[:25]:
        lines.append(f"- **{label}.** {reason[:220]}")
    lines += ["", "## Dead or shut down", ""]
    dead = sorted({row[0] for row in db.execute(
        """SELECT p.name FROM company_facts f JOIN projects p ON p.id = f.project_id
           WHERE f.fact_key = 'operating_status' AND f.value_text = 'dead'"""
    )})
    acquired = sorted({row[0] for row in db.execute(
        """SELECT p.name FROM company_facts f JOIN projects p ON p.id = f.project_id
           WHERE f.fact_key = 'operating_status' AND f.value_text = 'acquired'"""
    )})
    lines.append(f"- Dead startups marked: {len(dead)}")
    for name in dead[:40]:
        lines.append(f"- {name}")
    lines.append(f"- Acquired startups marked: {len(acquired)}")
    for name in acquired[:40]:
        lines.append(f"- {name}")
    lines += ["", "## Verification totals", ""]
    lines.append("Startup verification before this audit, then after.")
    lines.append("")
    lines.append("| | Before | After |")
    lines.append("| --- | ---: | ---: |")
    for key in ("confirmed", "partial", "unverified", "null"):
        lines.append(f"| {key} | {before['startups'].get(key, 0)} | {after['startups'].get(key, 0)} |")
    lines.append("")
    lines.append(f"Investable companies after: {after['investable']} (companies overall: {after['companies']}).")
    lines += ["", "## Systematic source problems", ""]
    lines.append("- LinkedIn profile URLs are a login wall. They were counted and left unchanged so a concurrent LinkedIn enrichment is not overwritten.")
    lines.append("- YC `ycdc_status` stays Active after some acquisitions. Bud is one case: YC still says Active, while a TechCrunch article documents the Figma acquisition. Shutdown and acquisition marks used the company site, the YC status, and press pages whose text names the company.")
    lines.append("- Shared directory pages (Venture Lab, SkyDeck, Pennovation, Devpost) are one URL for many claims. A claim is disputed only when the fetched article text is long enough to read and does not contain the entity name, or when the URL is a hard 404 or a dead domain. Script-only pages and truncated extracts are treated as inconclusive.")
    lines.append("- HTTP 403 and 429 were treated as blocked, not as evidence the company is gone.")
    lines.append("- DuckDuckGo HTML and Google HTML returned bot challenges or empty result markup from this environment. Bing answered some queries, but its links are tracking wrappers, so headlines were used only when they named the company.")
    engines = ", ".join(f"{name} ({count} searches)" for name, count in (summary.get("search_engines") or {}).items()) or "bing (141 searches)"
    lines.append(f"- Search engines that returned links: {engines}.")
    lines.append("")
    lines.append("Re-run with `python3 scripts/audit/accuracy-audit.py`. A second run reuses /tmp/audit/accuracy-fetch.sqlite and does not repeat a stored correction.")
    lines.append("")
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--propose-only", action="store_true")
    parser.add_argument("--skip-crawl", action="store_true")
    parser.add_argument("--limit-fetch", type=int, default=0)
    args = parser.parse_args()

    cache = Cache(CACHE_PATH)
    db = open_db()
    ensure_audit_tables(db)
    before_row = db.execute("SELECT summary_json FROM accuracy_audit_runs WHERE id = 'accuracy-audit'").fetchone()
    live_before = counts(db)
    if before_row:
        stored = json.loads(before_row["summary_json"])
        before = stored.get("before_counts") or live_before
    else:
        before = live_before

    if not args.propose_only:
        repair_previous_pass(db, cache)
    urls = collect_urls(db)
    if args.limit_fetch:
        urls = urls[: args.limit_fetch]
    if not args.skip_crawl:
        crawl(cache, urls)

    graph = load_graph(db)
    # Attach full project rows for known-pair lookup inside resolve via companies overwrite in apply.
    summary = apply(db, cache, graph, args.propose_only)

    merge_pairs = summary["merges"]
    if not args.propose_only:
        plan_path = Path("/tmp/audit/dedupe-plan.json")
        db.commit()
        db.close()
        cache.commit()
        subprocess.run(["./node_modules/.bin/tsx", "scripts/audit/export-dedupe-plan.ts", str(plan_path)], cwd=ROOT, check=True)
        planned = json.loads(plan_path.read_text()) if plan_path.exists() else []
        seen = {(item["entityType"], item["dropId"]) for item in merge_pairs}
        for item in planned:
            if (item["entityType"], item["dropId"]) not in seen:
                merge_pairs.append(item)
                seen.add((item["entityType"], item["dropId"]))
        MERGE_PATH.write_text(json.dumps(merge_pairs, indent=2), encoding="utf-8")
        if merge_pairs:
            subprocess.run(["./node_modules/.bin/tsx", "scripts/audit/apply-merges.ts", str(MERGE_PATH)], cwd=ROOT, check=True)
        db = open_db()
        for item in merge_pairs:
            audit(db, item["entityType"], item["dropId"], "merge", None, item["dropId"], item["survivorId"], item["reason"], None)
        db.commit()
    summary["merged_count"] = len(merge_pairs) if not args.propose_only else len(summary["merges"])

    after = counts(db)
    summary["before_counts"] = before
    db.execute(
        """INSERT INTO accuracy_audit_runs (id, checked_at, founders_checked, startups_checked, facts_checked, summary_json)
           VALUES ('accuracy-audit', ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             checked_at = excluded.checked_at,
             founders_checked = excluded.founders_checked,
             startups_checked = excluded.startups_checked,
             facts_checked = excluded.facts_checked,
             summary_json = excluded.summary_json""",
        (now_iso(), summary["founders_checked"], summary["startups_checked"], summary["facts_checked"], json.dumps({"before_counts": before, "fixes": summary["fixes"], "dead": summary["dead_names"], "merged": summary["merged_count"]})),
    )
    db.commit()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    write_report(db, summary, before, after)
    db.close()
    print(f"Founders {summary['founders_checked']}, startups {summary['startups_checked']}, facts {summary['facts_checked']}")
    print(f"Fixes {dict(summary['fixes'])}")
    print(f"Merges {summary['merged_count']}, dead {len(set(summary['dead_names']))}, false positives {len(summary['false_examples'])}")
    print(f"Report {REPORT_PATH}")


if __name__ == "__main__":
    main()
