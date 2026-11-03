#!/usr/bin/env python3
"""Build sourced RBPC 2026 company records and non-founder team contacts.

Official public PDF:
https://rbpc.rice.edu/sites/rbpc/files/2026-04/RBPC-2026-Competition-Company-Database.pdf

Required: pip install pymupdf
Run: python3 scripts/ingest/build-rbpc-2026.py data/imports/v3-campus-founders-batch17-rice-rbpc-2026.json

Names before email addresses are listed as *competition contacts*, NOT
founders unless another public source explicitly establishes that role.
Emails are never written into the output.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import urllib.request
from pathlib import Path

import fitz

URL = "https://rbpc.rice.edu/sites/rbpc/files/2026-04/RBPC-2026-Competition-Company-Database.pdf"
ROSTER = [
  [
    "AlchemII",
    "University of Tennessee, Knoxville",
    ""
  ],
  [
    "Altaris MedTech",
    "University of Arkansas",
    ""
  ],
  [
    "Armada Therapeutics",
    "Dartmouth College",
    "univ_dartmouth"
  ],
  [
    "Arrow Analytics",
    "Texas A&M University",
    ""
  ],
  [
    "Aura Life Science",
    "Northwestern University",
    "univ_northwestern"
  ],
  [
    "BeamFeed",
    "City University of New York",
    ""
  ],
  [
    "BiliRoo",
    "University of Michigan",
    "univ_michigan"
  ],
  [
    "BioLegacy",
    "Seattle University",
    ""
  ],
  [
    "BlueHealer",
    "Johns Hopkins University",
    ""
  ],
  [
    "BRCĒ",
    "Michigan State University",
    ""
  ],
  [
    "ChargeBay",
    "University of Miami",
    ""
  ],
  [
    "Cocoa Potash",
    "Case Western Reserve University",
    ""
  ],
  [
    "Cosnetix",
    "Yale University",
    "univ_yale"
  ],
  [
    "Cottage Core",
    "Kent State University",
    ""
  ],
  [
    "Crack'd Up",
    "University of Wisconsin-Madison",
    "univ_wisc"
  ],
  [
    "CystoPilot Technologies",
    "University of Texas at Austin",
    "univ_utexas"
  ],
  [
    "DialySafe",
    "Rice University",
    "univ_rice"
  ],
  [
    "Foregger Energy Solutions",
    "Babson College",
    ""
  ],
  [
    "Forge",
    "UC Berkeley",
    "univ_berkeley"
  ],
  [
    "Grapheon",
    "University of Pittsburgh",
    ""
  ],
  [
    "GUIDEAIR Labs",
    "University of Washington",
    "univ_uw"
  ],
  [
    "Hydrastack",
    "University of Chicago",
    "univ_uchicago"
  ],
  [
    "Imagine Devices",
    "University of Texas at Austin",
    "univ_utexas"
  ],
  [
    "Innowind Energy Solutions",
    "University of Waterloo",
    "univ_waterloo"
  ],
  [
    "JanuTech",
    "University of Washington",
    "univ_uw"
  ],
  [
    "Laetech",
    "University of Toronto",
    "univ_toronto"
  ],
  [
    "Salem Robotics",
    "University of Texas at Austin",
    "univ_utexas"
  ],
  [
    "Legion Platforms",
    "Arizona State University",
    ""
  ],
  [
    "Lucy",
    "University of Pennsylvania",
    "univ_penn"
  ],
  [
    "NerView Surgical",
    "McMaster University",
    ""
  ],
  [
    "Panoptica Technologies",
    "Georgia Institute of Technology",
    "univ_gatech"
  ],
  [
    "PowerHouse",
    "Massachusetts Institute of Technology",
    "univ_mit"
  ],
  [
    "Quantum Power Systems",
    "University of Texas at Austin",
    "univ_utexas"
  ],
  [
    "Routora",
    "University of Notre Dame",
    "univ_notredame"
  ],
  [
    "Sentivity.ai",
    "Virginia Tech",
    ""
  ],
  [
    "Shinra Energy",
    "Harvard Business School",
    "univ_harvard"
  ],
  [
    "Solid Air Dynamics",
    "RWTH Aachen University",
    ""
  ],
  [
    "Spine Bionics",
    "University of North Carolina",
    "univ_unc"
  ],
  [
    "The Good Company",
    "Michigan Technological University",
    ""
  ],
  [
    "UNCHAIN",
    "Lehigh University",
    ""
  ],
  [
    "VivoFlux",
    "University of Rochester",
    ""
  ],
  [
    "Vocadian",
    "University of Oxford",
    ""
  ]
]
CONTACT_PATTERN = re.compile(r"^([A-ZÀ-Ÿ][\wÀ-ÿ\s().'\-–]+):\s*\S+@\S+\.\S+", re.U)


def normalize(value: str) -> str:
    return value.replace("’", "'").replace("‘", "'").replace("\u00a0", " ").casefold().strip()


def pdf_text() -> list[list[str]]:
    request = urllib.request.Request(URL, headers={"User-Agent": "CampusScout/0.1 (+public-academic-sourcing)"})
    with urllib.request.urlopen(request, timeout=40) as response:
        doc_bytes = response.read()
    if not doc_bytes.startswith(b"%PDF"):
        raise RuntimeError("Rice source did not return a PDF")
    pdf = fitz.open(stream=doc_bytes, filetype="pdf")
    if len(pdf) < 17:
        raise RuntimeError(f"Unexpected Rice PDF page count: {len(pdf)}")
    return [page.get_text("text", sort=True).splitlines() for page in pdf]


def extract(page_lines: list[list[str]]) -> dict[str, tuple[str, list[str]]]:
    matches: dict[str, tuple[str, list[str]]] = {}
    for lines in page_lines[3:17]:
        starts = []
        for n, line in enumerate(lines):
            norm = normalize(line)
            for company, school, _ in ROSTER:
                # Match true company headings; a company mentioned in a
                # paragraph should never start a new company block.
                if norm.startswith(normalize(company) + ",") and normalize(school.split(",")[0]) in norm:
                    starts.append((n, company, school))
        starts.sort()
        for k, (begin, company, school) in enumerate(starts):
            stop = starts[k + 1][0] if k + 1 < len(starts) else len(lines)
            segment = lines[begin:stop]
            contacts: list[str] = []
            for line in segment:
                hit = CONTACT_PATTERN.match(line.strip())
                if hit:
                    person = " ".join(hit.group(1).split())
                    if 3 <= len(person) <= 75 and person not in contacts:
                        contacts.append(person)
            if company not in matches and contacts:
                matches[company] = (school, contacts)
    return matches


def main() -> None:
    destination = Path(sys.argv[1])
    extracted = extract(pdf_text())
    missing = [name for name, _, _ in ROSTER if name not in extracted]
    # Never silently import a partly parsed/ambiguous roster as complete.
    if missing:
        raise RuntimeError(f"Only {len(extracted)}/42 companies parsed; missing {missing}")
    output = {"retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "companies": [], "potential": [], "links": []}
    for name, school, campus in ROSTER:
        _, contacts = extracted[name]
        excerpt = f"{name}, {school}. RBPC 2026 team contacts: " + "; ".join(contacts)
        row = {
            "name": name, "description": None, "website": None, "sourceUrl": URL,
            "excerpt": excerpt, "orgPlace": "Rice Business Plan Competition 2026",
            "campusIds": [campus] if campus else [],
            "verificationStatus": "confirmed", "founders": [],
        }
        for contact in contacts:
            row["founders"].append({
                "name": contact, "aliases": [], "campusId": None,
                "affiliationRole": f"RBPC 2026 named team contact for {name} ({school})",
                "companyRole": "team_member", "founderStatus": "potential",
                "potentialSignal": f"Listed RBPC 2026 startup contact for {name}; founder role not established",
                "verificationStatus": "confirmed",
                "verificationNote": "The Rice 2026 PDF names this person as a team contact. No verified graduation year or legal cofounder status is inferred.",
                "excerpt": excerpt,
            })
        output["companies"].append(row)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"source": URL, "companies": len(output["companies"]),
        "namedTeamContacts": sum(len(x["founders"]) for x in output["companies"])}))


if __name__ == "__main__":
    main()
