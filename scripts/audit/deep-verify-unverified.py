#!/usr/bin/env python3
"""Deep-check startups still marked unverified after the 2026-09-27 audit.

Reads data/campus-universe.db. Fetches the program page that created each row,
any stored website, and web search results (company + founder + campus).
Writes /tmp/audit/deep-proposals.json. Does not modify the database.

  python3 scripts/audit/deep-verify-unverified.py
  python3 scripts/audit/deep-verify-unverified.py --limit 25
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import socket
import sqlite3
import time
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "campus-universe.db"
CACHE = Path("/tmp/audit/deep-cache")
HTML_CACHE = Path("/tmp/audit/deep-html")
SEARCH_CACHE = Path("/tmp/audit/deep-search")
YC_JSON = Path("/tmp/audit/yc-companies.json")
OUT = Path("/tmp/audit/deep-proposals.json")

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

# Not a company's own website.
DIRECTORY_HOSTS = {
    "uclaunch.com", "freeventures.org", "businesswire.com", "pulse2.com",
    "desaiaccelerator.com", "luma.com", "hypepotamus.com", "browndailyherald.com",
    "ajaxhealth.com", "techcrunch.com", "businessinsider.com", "medium.com",
    "substack.com", "devpost.com", "grasp.upenn.edu", "dca.wharton.upenn.edu",
    "ycombinator.com", "www.ycombinator.com", "linkedin.com", "www.linkedin.com",
    "twitter.com", "x.com", "facebook.com", "instagram.com", "youtube.com",
    "wikipedia.org", "en.wikipedia.org", "crunchbase.com", "www.crunchbase.com",
    "producthunt.com", "www.producthunt.com", "github.com", "news.ycombinator.com",
    "speedrun.a16z.com", "web.startx.com", "startx.com", "skydeck.berkeley.edu",
    "venturelab.upenn.edu", "pci.upenn.edu", "pennovation.upenn.edu",
    "healthtech.upenn.edu", "pennpip.upenn.edu", "www.engineering.upenn.edu",
    "entrepreneurship.columbia.edu", "entrepreneurship.mit.edu", "mitsloan.mit.edu",
    "www.cmu.edu", "www.velocityincubator.com", "kellercenter.princeton.edu",
    "stvp.stanford.edu", "create-x.gatech.edu", "entrepreneurship.illinois.edu",
    "innovationlabs.harvard.edu", "newsroom.haas.berkeley.edu", "www.thedp.com",
    "mackinstitute.wharton.upenn.edu", "www.thegarage.northwestern.edu",
    "pitchbook.com", "www.pitchbook.com", "tracxn.com", "www.wellfound.com",
    "wellfound.com", "angel.co", "golden.com", "www.cbinsights.com", "cbinsights.com",
    "bit.ly", "tinyurl.com", "linktr.ee", "t.co",
    "gust.com", "vcbacked.co", "www.vcbacked.co", "startupintros.com", "dealroom.co",
    "theorg.com", "www.theorg.com", "zoominfo.com", "www.zoominfo.com",
    "biobase.whitefordresearch.com", "yespress.io", "grokipedia.com", "www.grokipedia.com",
    "geeksforgeeks.org", "www.geeksforgeeks.org", "goodreads.com", "dictionary.cambridge.org",
    "link.springer.com", "knowyourmeme.com", "bizprofile.net", "www.bizprofile.net",
    "startupsavant.com", "www.startupsavant.com", "forbes.com", "www.forbes.com",
    "iceberg.apache.org", "apache.org", "jsdelivr.com", "www.jsdelivr.com",
    "c.parsers.vc", "parsers.vc", "youtube.com", "m.youtube.com",
    "tilebar.com", "www.tilebar.com", "skurnik.com", "www.skurnik.com",
    "tiffinmotorhomes.com", "www.tiffinmotorhomes.com", "mackenzie-childs.com",
    "inc42.com", "www.inc42.com", "studybreaks.com", "phillygaycalendar.com",
    "geekestateblog.com", "knoxvillevoyager.com", "ichgcp.net", "amsafoundation.org",
    "venturecapitaljournal.com", "www.venturecapitaljournal.com",
    "melissajanelee.com", "biodiversidade.com.pt",
}

NEWS_HINTS = (
    "techcrunch", "forbes", "businessinsider", "bizjournals", "reuters",
    "bloomberg", "wsj.com", "nytimes", "thedp.com", "dailybruin", "stanforddaily",
    "thecrimson", "columbiaspectator", "tech.cornell", "news.mit.edu",
    "news.berkeley.edu", "cmu.edu/news", "pennmedicine", "prnewswire",
    "globenewswire", "businesswire", "venturebeat", "axios", "sifted",
    "builtin", "alleywatch", "technical.ly", "pennbiz", "phillymag",
)

LEGAL = re.compile(
    r",?\s+(incorporated|inc\.?|llc\.?|l\.l\.c\.?|ltd\.?|pte\.?|corp\.?|co\.?|plc\.?|gmbh|limited)$",
    re.I,
)
STOP = {
    "inc", "llc", "ltd", "pte", "corp", "company", "co", "the", "and", "of", "for",
    "labs", "lab", "ai", "io", "hq", "app", "studios", "studio", "technologies",
    "technology", "systems", "robotics", "health", "bio", "group", "global",
}
COMMON = {
    "april", "color", "haven", "mobility", "pipeline", "gees", "alva", "flick",
    "nori", "sava", "sitch", "seak", "cru", "kyma", "heavi", "oleum", "verra",
    "luvu", "prism", "meteor", "fluid", "scout", "keye", "matcha", "halo",
    "oasis", "nova", "atlas", "orbit", "spark", "forge", "pixel", "echo",
    "lily", "maple", "cedar", "amber", "bloom", "peak", "north", "south",
    "west", "east", "alpha", "beta", "delta", "prime", "one", "zero", "open",
    "simple", "clear", "bright", "true", "real", "next", "first", "home",
    "care", "mind", "flow", "wave", "path", "link", "base", "core", "form",
    "stack", "shift", "scale", "field", "space", "works", "studio", "collective",
}

PARKING = (
    "domain for sale", "buy this domain", "domain is for sale", "hugedomains",
    "this domain", "sedo.com", "afternic", "godaddy", "parkingcrew",
    "related searches", "dan.com",
)
SPAM = ("casino", "gambling", "slot", "betflik", "viagra", "porn", "xxx")

BOILERPLATE = (
    "not yet researched",
    "skydeck does not publish",
    "spark grant recipient",
    "listed on berkeley skydeck",
    "penn-licensed startup listed",
    "product/sector not yet researched",
    "eight illini-founded",
)


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower()


def tokens(text: str) -> list[str]:
    return [p for p in re.findall(r"[a-z0-9]+", fold(text)) if len(p) > 1 and p not in STOP]


def compact(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", fold(text))


def core_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)", " ", name or "")
    name = re.sub(r"\s+by\s+.+$", " ", name, flags=re.I)
    name = LEGAL.sub("", name.strip())
    name = re.sub(r"\s+", " ", name).strip(" -–—,")
    return name


def host_of(url: str | None) -> str:
    if not url:
        return ""
    try:
        host = urlparse(url).netloc.lower()
    except ValueError:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def cache_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:24]


def fetch(url: str, timeout: int = 10, save_html: bool = False) -> dict:
    key = cache_key(url)
    path = CACHE / f"{key}.json"
    html_path = HTML_CACHE / f"{key}.html"
    if path.exists() and (not save_html or html_path.exists()):
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            pass
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"})
    body = ""
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read(180_000)
            ctype = res.headers.get("content-type", "")
            charset = "utf-8"
            m = re.search(r"charset=([\w-]+)", ctype, re.I)
            if m:
                charset = m.group(1)
            try:
                body = raw.decode(charset, errors="replace")
            except LookupError:
                body = raw.decode("utf-8", errors="replace")
            payload = {
                "ok": 200 <= res.status < 400,
                "status": res.status,
                "final_url": res.geturl(),
                "title": page_title(body),
                "description": meta_description(body),
                "text": visible_text(body),
                "error": None,
                "url": url,
            }
    except urllib.error.HTTPError as err:
        payload = {"ok": False, "status": err.code, "final_url": url, "title": "", "description": "", "text": "", "error": f"HTTP {err.code}", "url": url}
    except Exception as err:  # noqa: BLE001
        payload = {"ok": False, "status": None, "final_url": url, "title": "", "description": "", "text": "", "error": f"{type(err).__name__}: {err}"[:240], "url": url}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload))
    if save_html:
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text(body)
    return payload


def page_title(body: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
    if not m:
        return ""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))).strip()[:240]


def meta_description(body: str) -> str:
    m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', body, re.I | re.S)
    if not m:
        m = re.search(r'<meta[^>]+content=["\'](.*?)["\'][^>]+name=["\']description["\']', body, re.I | re.S)
    if not m:
        m = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\'](.*?)["\']', body, re.I | re.S)
    if not m:
        return ""
    return re.sub(r"\s+", " ", html.unescape(m.group(1))).strip()[:400]


def visible_text(body: str) -> str:
    text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", body)
    text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text)[:5000]


def is_directory(url: str) -> bool:
    host = host_of(url)
    if not host:
        return True
    if host in DIRECTORY_HOSTS:
        return True
    suffixes = (
        ".edu", "wikipedia.org", "linkedin.com", "crunchbase.com", "producthunt.com",
        "github.com", "github.io", "ycombinator.com", "medium.com", "substack.com",
        "apache.org", "readthedocs.io", "wikipedia.org",
    )
    return any(host == s or host.endswith("." + s) or host.endswith(s) for s in suffixes)


def junk_page(blob: str) -> bool:
    low = fold(blob)
    if any(k in low for k in SPAM):
        return True
    if any(k in low for k in PARKING) and "startup" not in low:
        return True
    return False


def strict_name(name: str) -> bool:
    parts = tokens(core_name(name))
    if len(parts) != 1:
        return False
    token = parts[0]
    return len(token) <= 5 or token in COMMON


GENERIC_TOKENS = {
    "labs", "lab", "ai", "app", "io", "hq", "health", "bio", "robotics", "systems",
    "technologies", "technology", "therapeutics", "studio", "studios", "group", "global",
    "medical", "sciences", "science", "energy", "space", "digital", "tech", "capital",
    "ventures", "foundation", "social", "games", "game", "foods", "food",
}


def brand_tokens(name: str) -> list[str]:
    parts = [p for p in re.findall(r"[a-z0-9]+", fold(core_name(name))) if len(p) > 2 and p not in STOP]
    distinctive = [p for p in parts if p not in GENERIC_TOKENS]
    return distinctive or parts


def host_has_brand(name: str, url: str) -> bool:
    labels = re.split(r"[.\-]", host_of(url))
    prefixes = ("get", "try", "use", "join", "with", "my", "go", "the", "app", "hi", "hey", "ask", "meet", "add")
    for token in brand_tokens(name):
        if len(token) < 4:
            continue
        for label in labels:
            if label == token or any(label == pre + token for pre in prefixes):
                return True
            if label.endswith(token) and 0 < len(label) - len(token) <= 3:
                return True
    return False


def looks_like_article(url: str) -> bool:
    path = fold(urlparse(url).path)
    return any(part in path for part in (
        "/news/", "/article/", "/articles/", "/interview/", "/podcast/", "/stories/",
        "/press/", "/blog/", "/profile/", "/person/", "/book/", "/memes/", "/tag/",
        "/journal/", "/abstract/", "/doi/",
    ))


def name_matches(name: str, title: str, text: str, url: str) -> bool:
    """True when this URL is the company's own site, not a mention on someone else's page."""
    if is_directory(url) or looks_like_article(url):
        return False
    parts = brand_tokens(name)
    if not parts:
        return False
    title_f = fold(title)
    blob = fold(f"{title} {text}")
    if junk_page(title) or junk_page(blob[:500]):
        return False
    if not all(re.search(rf"\b{re.escape(p)}\b", title_f) for p in parts):
        return False
    # Domain has to carry the brand. A title mention on someone else's site is not a website.
    return host_has_brand(name, url)


def phrase_in(name: str, text: str) -> bool:
    core = core_name(name)
    parts = tokens(core)
    if not parts:
        return False
    blob = fold(text)
    if len(parts) == 1:
        return re.search(rf"\b{re.escape(parts[0])}\b", blob) is not None
    return all(p in blob for p in parts)


def search(query: str) -> list[dict]:
    path = SEARCH_CACHE / f"{cache_key(query)}.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            pass
    from ddgs import DDGS

    results: list[dict] = []
    last_err = None
    for attempt in range(3):
        try:
            with DDGS(timeout=25) as ddgs:
                results = list(ddgs.text(query, max_results=6) or [])
            break
        except Exception as err:  # noqa: BLE001
            last_err = str(err)
            time.sleep(1.5 * (attempt + 1))
    if last_err and not results:
        results = [{"title": "", "href": "", "body": f"search error: {last_err[:180]}"}]
    slim = [{"title": r.get("title") or "", "href": r.get("href") or "", "body": r.get("body") or ""} for r in results]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(slim))
    return slim


def load_rows(db: sqlite3.Connection) -> list[dict]:
    rows = []
    companies = db.execute(
        """SELECT id, name, description, website_url, primary_link, primary_link_kind,
                  sector, is_investable_candidate, verification_note
           FROM projects WHERE kind='company' AND verification_status='unverified'
           ORDER BY name"""
    ).fetchall()
    for company in companies:
        claim = db.execute(
            """SELECT cl.source_url, cl.excerpt, s.name AS source_name, s.url AS source_list_url
               FROM claims cl LEFT JOIN sources s ON s.id = cl.source_id
               WHERE cl.entity_type='project' AND cl.entity_id=?
               ORDER BY COALESCE(cl.published_date, cl.created_at), cl.created_at
               LIMIT 1""",
            (company["id"],),
        ).fetchone()
        founders = db.execute(
            """SELECT pe.id, pe.name, pe.founder_status
               FROM person_project_roles r JOIN people pe ON pe.id = r.person_id
               WHERE r.project_id=? AND r.role LIKE '%founder%'""",
            (company["id"],),
        ).fetchall()
        campuses = [r[0] for r in db.execute(
            """SELECT DISTINCT u.name FROM person_project_roles r
               JOIN affiliations a ON a.person_id = r.person_id
               JOIN universities u ON u.id = a.university_id
               WHERE r.project_id=?""",
            (company["id"],),
        )]
        rows.append({
            "id": company["id"],
            "name": company["name"],
            "description": company["description"] or "",
            "website_url": company["website_url"],
            "primary_link": company["primary_link"],
            "sector": company["sector"],
            "is_investable_candidate": company["is_investable_candidate"],
            "verification_note": company["verification_note"] or "",
            "source_name": (claim["source_name"] if claim else "") or "",
            "source_url": ((claim["source_url"] if claim else None) or (claim["source_list_url"] if claim else None) or ""),
            "excerpt": (claim["excerpt"] if claim else "") or "",
            "founders": [{"id": f["id"], "name": f["name"], "founder_status": f["founder_status"]} for f in founders],
            "campuses": campuses,
        })
    return rows


def source_campus(row: dict) -> str:
    blob = fold(f"{row['source_name']} {row['source_url']}")
    rules = [
        ("penn", ("venture lab", "vip-x", "vip alumni", "penn health", "pci", "pennovation", "grasp", "y-prize", "eas 5490", "president's innovation", "wharton", "m&t", "daily pennsylvanian", "penn startup", "penn engineering", "upenn")),
        ("berkeley", ("skydeck", "berkeley", "haas", "teragen")),
        ("harvard", ("harvard", "innovationlabs.harvard")),
        ("columbia", ("columbia",)),
        ("cmu", ("cmu", "project olympus")),
        ("mit", ("mit delta", "mit $100k", "entrepreneurship.mit", "mitsloan")),
        ("waterloo", ("velocity", "waterloo")),
        ("stanford", ("startx", "stvp", "cardinal ventures", "stanford")),
        ("georgia tech", ("create-x", "gatech")),
        ("princeton", ("keller", "princeton")),
        ("illinois", ("illinois", "illini")),
        ("michigan", ("michigan",)),
    ]
    for campus, keys in rules:
        if any(k in blob for k in keys):
            return campus
    if "hotspot" in blob or "speedrun" in blob or "y combinator" in blob:
        return "multi-campus"
    return "unknown"


def nearby_links(page_html: str, name: str) -> list[str]:
    """Find hrefs in a small window around the company name. Linear scan, no nested quantifiers."""
    if not page_html or not name:
        return []
    parts = [p for p in re.findall(r"[a-z0-9]+", fold(core_name(name))) if len(p) > 1]
    if not parts:
        return []
    low = page_html.lower()
    needle = parts[0]
    links: list[str] = []
    start = 0
    hits = 0
    while hits < 6:
        i = low.find(needle, start)
        if i < 0:
            break
        start = i + len(needle)
        window_low = low[i:i + 180]
        if not all(part in window_low for part in parts):
            continue
        hits += 1
        window = page_html[max(0, i - 700): i + 700]
        for href in re.findall(r'href=["\']([^"\']+)["\']', window, re.I):
            if href.startswith("#") or href.startswith("mailto:") or href.startswith("javascript:"):
                continue
            links.append(html.unescape(href).strip())
    return links


def absolute(base: str, href: str) -> str:
    if href.startswith("http://") or href.startswith("https://"):
        return href
    if base:
        return urljoin(base, href)
    return ""


def load_yc() -> list[dict]:
    if not YC_JSON.exists():
        return []
    data = json.loads(YC_JSON.read_text())
    return data if isinstance(data, list) else []


def yc_candidate(name: str, yc: list[dict], batch_hint: str | None) -> dict | None:
    core = fold(core_name(name))
    hits = [c for c in yc if fold(c.get("name") or "") == core]
    if batch_hint:
        batched = [c for c in hits if batch_hint.lower() in fold(c.get("batch") or "")]
        if len(batched) == 1:
            return batched[0]
    if len(hits) == 1:
        return hits[0]
    return None


def good_description(text: str) -> str | None:
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) < 40 or len(text) > 320:
        return None
    if junk_page(text):
        return None
    low = fold(text)
    if any(b in low for b in ("cookie", "javascript", "enable cookies", "just a moment", "access denied")):
        return None
    return text


def boilerplate(description: str) -> bool:
    low = fold(description)
    if not low or len(low) < 25:
        return True
    return any(b in low for b in BOILERPLATE)


def classify(row: dict, pages: dict[str, dict], yc: list[dict]) -> dict:
    evidence: list[dict] = []
    founders = row["founders"]
    last_names = []
    for founder in founders:
        parts = re.findall(r"[A-Za-z][A-Za-z'’\-]+", founder["name"])
        if parts:
            last_names.append(fold(parts[-1]))
    campus_words = [source_campus(row)]
    for campus in row["campuses"]:
        campus_words.append(fold(campus))
    campus_words = [c for c in campus_words if c and c not in ("unknown", "multi-campus")]

    candidates: list[str] = []
    if row["website_url"]:
        candidates.append(row["website_url"])
    source_page = pages.get(row["source_url"]) if row["source_url"] else None
    # Source HTML is not stored on the fetch payload; links were pre-extracted.
    for link in row.get("extracted_links") or []:
        if link not in candidates:
            candidates.append(link)

    batch_hint = "Fall 2025" if "fall 2025" in fold(row["description"] + row["source_name"]) else None
    yc_hit = yc_candidate(row["name"], yc, batch_hint)
    if yc_hit and yc_hit.get("website"):
        candidates.append(yc_hit["website"])
        evidence.append({
            "kind": "yc",
            "url": f"https://www.ycombinator.com/companies/{yc_hit.get('slug')}",
            "title": yc_hit.get("name") or "",
            "excerpt": (yc_hit.get("one_liner") or "")[:240],
        })

    confirmed_url = None
    confirmed_page = None
    for url in candidates:
        if not url or is_directory(url):
            continue
        page = pages.get(url)
        if not page or not page.get("ok"):
            continue
        final = page.get("final_url") or url
        if is_directory(final):
            continue
        blob = " ".join([page.get("title") or "", page.get("description") or "", page.get("text") or ""])
        if name_matches(row["name"], page.get("title") or "", blob, final):
            confirmed_url = final if final.startswith("http") else url
            confirmed_page = page
            break

    search_hits = row.get("search") or []
    for hit in search_hits:
        href = hit.get("href") or ""
        if not href:
            continue
        evidence.append({"kind": "search", "url": href, "title": hit.get("title") or "", "excerpt": (hit.get("body") or "")[:240]})

    if confirmed_url and confirmed_page:
        desc = good_description(confirmed_page.get("description") or "") if boilerplate(row["description"]) else None
        excerpt = (confirmed_page.get("description") or confirmed_page.get("title") or "")[:240]
        return proposal(row, "confirmed", confirmed_url, desc, confirmed_url, excerpt,
                        f"Live site matches {core_name(row['name'])}.", evidence)

    # Course projects leave the startup list unless their own site confirmed above.
    drop = drop_reason(row, search_hits)
    if drop:
        return proposal(row, "drop", None, None, drop["url"], drop["excerpt"], drop["note"], evidence)

    partial = pick_partial(row, search_hits, last_names, campus_words, pages, yc_hit)
    if partial:
        return partial

    return proposal(row, "unverified", None, None, "", "", row["verification_note"], evidence)


def slug_has_brand(name: str, href: str) -> bool:
    slug = fold(href.rstrip("/").split("/")[-1]).replace("-", "")
    return any(token in slug for token in brand_tokens(name) if len(token) >= 4)


def pick_partial(row, search_hits, last_names, campus_words, pages, yc_hit) -> dict | None:
    """A cited public page that identifies this company, short of a confirmed own website."""
    junk_hosts = ("reddit.com", "duckduckgo.com", "youtube.com", "gust.com", "grokipedia.com",
                  "goodreads.com", "knowyourmeme.com", "geeksforgeeks.org", "dictionary.",
                  "springer.com", "apache.org", "github.io", "zoominfo.com", "tiffinmotorhomes",
                  "tilebar.com", "skurnik.com", "mackenzie-childs", "biodiversidade.com")
    for hit in search_hits:
        href = hit.get("href") or ""
        title = hit.get("title") or ""
        body = hit.get("body") or ""
        blob = f"{title} {body}"
        if not href or not phrase_in(row["name"], blob):
            continue
        host = host_of(href)
        if not host or any(bad in host for bad in junk_hosts):
            continue
        founder_ok = any(len(n) >= 4 and re.search(rf"\b{re.escape(n)}\b", fold(blob)) for n in last_names)
        campus_ok = any(c in fold(blob) for c in campus_words if len(c) >= 4)
        linkedin_co = "/company/" in href and "linkedin.com" in host and slug_has_brand(row["name"], href)
        product_hunt = "producthunt.com" in host and (slug_has_brand(row["name"], href) or phrase_in(row["name"], title))
        yc_page = "ycombinator.com" in host and "/companies/" in href and slug_has_brand(row["name"], href)
        speedrun = "speedrun.a16z.com" in host and "/companies/" in href and slug_has_brand(row["name"], href)
        skydeck = "skydeck.berkeley.edu" in host and "/companies/" in href and slug_has_brand(row["name"], href)
        pci = "pci.upenn.edu" in host and any(k in href for k in ("/portfolio/", "/icorps")) and slug_has_brand(row["name"], href)
        news = (any(h in host for h in NEWS_HINTS) or host.endswith(".edu")) and phrase_in(row["name"], title + " " + body)
        news_ok = news and (founder_ok or (campus_ok and len(brand_tokens(row["name"])) >= 2 and not strict_name(row["name"])))
        page = pages.get(href)
        if page and page.get("ok"):
            final = page.get("final_url") or href
            text = " ".join([page.get("title") or "", page.get("description") or "", page.get("text") or ""])
            if name_matches(row["name"], page.get("title") or "", text, final):
                desc = good_description(page.get("description") or "") if boilerplate(row["description"]) else None
                return proposal(row, "confirmed", final, desc, final, (page.get("description") or page.get("title") or "")[:240],
                                f"Live site matches {core_name(row['name'])}.", [])
        if host_has_brand(row["name"], href) and phrase_in(row["name"], title) and not is_directory(href) and not looks_like_article(href):
            return proposal(
                row, "partial", href, None, href, (body or title)[:240],
                "Search index titles this domain as the company. Direct fetch did not return a readable page, so this is partly verified.",
                [],
            )
        if linkedin_co or product_hunt or yc_page or speedrun or skydeck or pci or news_ok:
            if linkedin_co:
                kind = "LinkedIn company page"
            elif product_hunt:
                kind = "Product Hunt"
            elif yc_page:
                kind = "YC company page"
            elif speedrun:
                kind = "a16z speedrun page"
            elif skydeck:
                kind = "SkyDeck company page"
            elif pci:
                kind = "Penn Center for Innovation portfolio page"
            else:
                kind = "News page"
            one = (yc_hit.get("one_liner") if yc_hit and yc_page else None) or ""
            desc = one if one and boilerplate(row["description"]) else None
            return proposal(
                row, "partial", None, desc, href, (one or body or title)[:240],
                f"{kind} identifies {core_name(row['name'])}. No confirmed company website.",
                [],
            )
    if yc_hit:
        href = f"https://www.ycombinator.com/companies/{yc_hit.get('slug')}"
        one = (yc_hit.get("one_liner") or "")[:240]
        return proposal(row, "partial", None, one if boilerplate(row["description"]) else None,
                        href, one, "Unique YC company record matches this name and cohort. Own site was not confirmed.", [])
    return None


def drop_reason(row: dict, search_hits: list[dict]) -> dict | None:
    source = fold(row["source_name"])
    course = "eas 5490" in source or ("devpost" in source and "engineering" in source)
    if not course:
        return None
    # A real continuation would have been confirmed before we get here.
    url = row["primary_link"] or row["source_url"]
    return {
        "url": url,
        "excerpt": (row["description"] or row["excerpt"] or "")[:240],
        "note": "Penn Engineering EAS 5490 Spring 2026 course project on Devpost. No independent company site or continuation was found, so it is off the startup list.",
    }


def proposal(row, action, website, description, source_url, excerpt, note, evidence) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "action": action,
        "website": website,
        "description": description,
        "source_url": source_url,
        "excerpt": (excerpt or "")[:300],
        "note": note,
        "founders": row["founders"],
        "source_name": row["source_name"],
        "source_campus": source_campus(row),
        "campuses": row["campuses"],
        "prior_note": row["verification_note"],
        "stored_website": row["website_url"],
        "investable": row["is_investable_candidate"],
        "evidence": evidence[:6],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    rows = load_rows(db)
    if args.limit:
        rows = rows[: args.limit]
    print(f"rows {len(rows)}", flush=True)

    socket.setdefaulttimeout(12)
    source_urls = sorted({r["source_url"] for r in rows if r["source_url"].startswith("http")})
    print(f"fetching {len(source_urls)} source pages", flush=True)
    pages: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(fetch, url, 10, True): url for url in source_urls}
        for fut in as_completed(futs):
            url = futs[fut]
            pages[url] = fut.result()
    print("extracting links from source pages", flush=True)
    html_by_url = {}
    for url in source_urls:
        path = HTML_CACHE / f"{cache_key(url)}.html"
        html_by_url[url] = path.read_text(errors="replace") if path.exists() else ""

    for row in rows:
        page_html = html_by_url.get(row["source_url"]) or ""
        links = []
        for href in nearby_links(page_html, row["name"]):
            abs_url = absolute(row["source_url"], href)
            if abs_url and not is_directory(abs_url):
                links.append(abs_url.split("#")[0])
        # de-dupe, keep order
        seen = set()
        row["extracted_links"] = []
        for link in links:
            if link in seen:
                continue
            seen.add(link)
            row["extracted_links"].append(link)
            if len(row["extracted_links"]) >= 4:
                break

    yc = load_yc()
    site_urls = []
    for row in rows:
        if row["website_url"]:
            site_urls.append(row["website_url"])
        site_urls.extend(row["extracted_links"])
        batch_hint = "Fall 2025" if "fall 2025" in fold(row["description"] + row["source_name"]) else None
        hit = yc_candidate(row["name"], yc, batch_hint)
        if hit and hit.get("website"):
            site_urls.append(hit["website"])
    site_urls = list(dict.fromkeys(u for u in site_urls if u.startswith("http")))
    print(f"fetching {len(site_urls)} candidate sites", flush=True)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(fetch, url): url for url in site_urls}
        for fut in as_completed(futs):
            pages[futs[fut]] = fut.result()

    # Search companies that are not already confirmed by a fetched site.
    pending = []
    for row in rows:
        confirmed = False
        for url in [row["website_url"], *row["extracted_links"]]:
            page = pages.get(url or "")
            if not page or not page.get("ok"):
                continue
            final = page.get("final_url") or url
            blob = " ".join([page.get("title") or "", page.get("description") or "", page.get("text") or ""])
            if url and not is_directory(final) and name_matches(row["name"], page.get("title") or "", blob, final):
                confirmed = True
                break
        if not confirmed:
            pending.append(row)
    print(f"searching {len(pending)} without a confirmed site", flush=True)

    def do_search(row: dict) -> tuple[str, list[dict]]:
        founder = ""
        if row["founders"]:
            parts = re.findall(r"[A-Za-z][A-Za-z'’\-]+", row["founders"][0]["name"])
            if len(parts) >= 2:
                founder = parts[-1]
        campus = ""
        if row["campuses"]:
            campus = row["campuses"][0].split(",")[0].replace("University of ", "").replace("University", "").strip()
        else:
            mapped = source_campus(row)
            if mapped not in ("unknown", "multi-campus"):
                campus = mapped
        query = f"\"{core_name(row['name'])}\""
        if founder:
            query += f" {founder}"
        elif campus:
            query += f" {campus} startup"
        else:
            query += " startup"
        return row["id"], search(query)

    done = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {pool.submit(do_search, row): row for row in pending}
        by_id = {row["id"]: row for row in rows}
        for fut in as_completed(futs):
            pid, hits = fut.result()
            by_id[pid]["search"] = hits
            done += 1
            if done % 40 == 0:
                print(f"  searched {done}/{len(pending)}", flush=True)

    # Fetch promising search URLs for still-unconfirmed rows.
    extra = []
    for row in pending:
        for hit in (row.get("search") or [])[:4]:
            href = hit.get("href") or ""
            if not href.startswith("http") or is_directory(href):
                continue
            if phrase_in(row["name"], f"{hit.get('title') or ''} {hit.get('body') or ''}"):
                extra.append(href)
    extra = [u for u in dict.fromkeys(extra) if u not in pages]
    print(f"fetching {len(extra)} search-result pages", flush=True)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(fetch, url): url for url in extra}
        for fut in as_completed(futs):
            pages[futs[fut]] = fut.result()

    proposals = [classify(row, pages, yc) for row in rows]
    OUT.write_text(json.dumps(proposals, indent=2))
    from collections import Counter
    counts = Counter(p["action"] for p in proposals)
    print("actions", dict(counts))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
