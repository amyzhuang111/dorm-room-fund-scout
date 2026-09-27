#!/usr/bin/env python3
"""Cohort rosters copied from public pages, deduped against campus-universe.db.

Sources, each fetched before this file was written:

- Cornell eLab 2025-26: https://eship.cornell.edu/elab-accepts-record-number-of-student-startups-to-fall-cohort/
- Penn VIP-X Spring 2026: https://www.linkedin.com/posts/vntrlab_activity-7428169031628709888-E8jf
- Penn VIP-X Fall 2025: https://www.linkedin.com/posts/siobhan-scott-803a87b0_after-many-weeks-of-reviewing-applications-activity-7383964763522826240-eDcO
- Michigan Zell 2025-26: https://zli.umich.edu/meet-the-2025-2026-zell-entrepreneurs/
- MIT delta v 2025: https://entrepreneurship.mit.edu/accelerator/2025-delta-v/
- MIT Investor Day lookbook: https://entrepreneurship.mit.edu/wp-content/uploads/Investor-Day-2025-Look-Book-v3.pdf
- CMU VentureBridge '26: https://www.cmu.edu/swartz-center-for-entrepreneurship/resources-funding-and-talent/venturebridge/venturebridge-2026-cohort-and-fellows-launch.html

Does not invent class years. Skips initials-only names. Skips people already stored,
except a short allow-list of people who are in the database but not yet tied to the
company this page names.

    python3 scripts/ingest/build-cohort-batch.py data/imports/v3-campus-founders-batch9.json
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "campus-universe.db"

CORNELL = "https://eship.cornell.edu/elab-accepts-record-number-of-student-startups-to-fall-cohort/"
VIPX_SPRING = "https://www.linkedin.com/posts/vntrlab_activity-7428169031628709888-E8jf"
VIPX_FALL = "https://www.linkedin.com/posts/siobhan-scott-803a87b0_after-many-weeks-of-reviewing-applications-activity-7383964763522826240-eDcO"
ZELL = "https://zli.umich.edu/meet-the-2025-2026-zell-entrepreneurs/"
DELTA = "https://entrepreneurship.mit.edu/accelerator/2025-delta-v/"
LOOKBOOK = "https://entrepreneurship.mit.edu/wp-content/uploads/Investor-Day-2025-Look-Book-v3.pdf"
VB = "https://www.cmu.edu/swartz-center-for-entrepreneurship/resources-funding-and-talent/venturebridge/venturebridge-2026-cohort-and-fellows-launch.html"

# People already stored who still need the company this page names.
LINK_EXISTING = {
    "Nicholas Manuto",
    "Shiyao Ning",
    "Stanley Liu",
    "Ryan Lynn",
}


def norm_person(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def enrollment(year: int, evidence: str) -> dict:
    status = "current_student" if year > 2026 else "recent_grad" if year >= 2023 else "older_alumni"
    return {
        "status": status,
        "basis": "verified",
        "label": f"'{str(year)[2:]}",
        "gradYear": year,
        "evidence": evidence,
    }


def founder(name: str, campus: str, role: str, note: str, excerpt: str, year: int | None, known: set[str]) -> dict | None:
    if norm_person(name) in known and name not in LINK_EXISTING:
        return None
    row = {
        "name": name,
        "aliases": [],
        "campusId": campus,
        "affiliationRole": role,
        "founderStatus": "founder",
        "potentialSignal": None,
        "verificationStatus": "confirmed",
        "verificationNote": note,
        "excerpt": excerpt,
    }
    if year is not None and name not in LINK_EXISTING:
        row["enrollment"] = enrollment(year, excerpt)
    return row


def company(name, description, website, source, excerpt, org, campuses, founders, investor_name, investor_excerpt) -> dict | None:
    founders = [f for f in founders if f]
    if not founders:
        return None
    return {
        "name": name,
        "description": description,
        "website": website,
        "sourceUrl": source,
        "excerpt": excerpt,
        "orgPlace": org,
        "campusIds": campuses,
        "founders": founders,
        "investors": [
            {
                "name": investor_name,
                "excerpt": investor_excerpt,
                "sourceUrl": source,
                "batch": None,
                "kind": "accelerator",
            }
        ],
    }


def potential(name, campus, role, note, org, source, excerpt, known: set[str]) -> dict | None:
    if norm_person(name) in known:
        return None
    return {
        "name": name,
        "aliases": [],
        "campusId": campus,
        "affiliationRole": role,
        "potentialSignal": "stealth or potential founder",
        "verificationStatus": "confirmed",
        "verificationNote": note,
        "orgPlace": org,
        "sourceUrl": source,
        "excerpt": excerpt,
    }


def cornell_rows(known: set[str]) -> list[dict]:
    # (company, person, year). Years are the class years printed on the eLab page.
    # Product descriptions are not on the page, so description stays a cohort fact.
    teams = [
        ("AgPilot", [("Andrew James", 2026)]),
        ("Airhouse", [("Boris Bialer", 2026)]),
        ("Arqen.AI", [("Jacob Michael Potoczak", 2026)]),
        ("Balkan Sauce", [("Mohammad Alrahmah", 2027)]),
        ("Binary Holographics Corporations", [("HP Park", 2028)]),
        ("Clique", [("Pragun Sharma", 2028)]),
        ("Eduni", [("Noah Wilson", 2026), ("Jasper Tripp", 2027)]),
        ("FYBRE", [("Bren Bodin", 2026)]),
        ("GrannyGains", [("Matthew Kahn", 2026)]),
        ("GymPoint", [("Ezana Kavuma", 2028)]),
        ("HippoFlo", [("Nancy Chen", 2027)]),
        ("Novl", [("Ryaan Aqid", 2027)]),
        ("Paygent", [("Ava Poole", 2027)]),
        ("Physis", [("Elissa Benham", 2026)]),
        ("PortNexus AI", [("Zijian Xu", 2026), ("Xibei Xie", 2026)]),
        ("Power Crunch", [("Waritsara Khongkomolsakul", 2027)]),
        ("Rootulu", [("Dillon Gordon", 2026)]),
        ("Scoobii!", [("Jiaxi Wang", 2026)]),
        ("VigilantAI", [("Jay Patel", 2026)]),
        ("Wiha.Ai", [("Lydia Yilekal", 2026)]),
    ]
    out = []
    for cname, people in teams:
        founders = []
        bits = []
        for person, year in people:
            yy = str(year)[2:]
            excerpt = (
                f"Cornell eLab lists {person} '{yy} on {cname} in the 2025-26 student startup cohort. "
                "The program accepts student founders from Cornell's Ithaca campus."
            )
            bits.append(f"{person} '{yy}")
            founders.append(
                founder(
                    person,
                    "univ_cornell",
                    "Cornell eLab 2025-26, Cornell University",
                    f"Cornell eLab's 2025-26 cohort page names {person} as a student founder of {cname} and prints class year '{yy}.",
                    excerpt,
                    year,
                    known,
                )
            )
        excerpt = (
            f"Cornell eLab lists {cname} in the 2025-26 student startup cohort: {', '.join(bits)}. "
            "The page does not describe the product."
        )
        row = company(
            cname,
            "Student startup selected for Cornell eLab's 2025-26 cohort.",
            None,
            CORNELL,
            excerpt,
            "Cornell eLab",
            ["univ_cornell"],
            founders,
            "Cornell eLab",
            f"Entrepreneurship at Cornell lists {cname} in the eLab 2025-26 cohort. The page says top-performing teams can receive a spring investment and does not state that {cname} has received one.",
        )
        if row:
            out.append(row)
    return out


def penn_rows(known: set[str]) -> list[dict]:
    spring = [
        ("FloDx", ["Nicholas Manuto", "Sophia Jorgensen", "Elliot Jang"], None),
        ("Girl Math Capital", ["Serena Ainslie"], None),
        ("SABE", ["Veronica Rivera"], None),
        ("Securest", ["Chris Harrington"], None),
        ("TUFANY", ["Ahmad Hasanian"], None),
    ]
    fall = [
        ("Avara", [("Ariela Zebede", 2026)], "WG'26, MD'26"),
        ("Atelic", [("Stanley Liu", 2026), ("Shiyao Ning", 2026)], "GEN'26"),
        ("OnGov", [("Silas Deane", 2026)], "G'26"),
        ("Refract Network", [("Brandon Kong", 2027)], "SEAS'27"),
        ("Vairo.AI", [("Evan Caracciolo", 2027), ("Ryan Caracciolo", None)], "WG'27 for Evan Caracciolo; no class year is printed for Ryan Caracciolo"),
        ("ZenBroth", [("Xiaofeng Zhu", 2026)], "GED'26"),
    ]
    out = []
    for cname, people, _year in spring:
        founders = []
        for person in people:
            excerpt = (
                f"Venture Lab's VIP-X Philly Spring 2026 post lists {person} on {cname}. "
                "Siobhan Scott, Associate Director of VIP-X, posted the cohort."
            )
            founders.append(
                founder(
                    person,
                    "univ_penn",
                    "Penn Venture Lab VIP-X Philly Spring 2026",
                    f"The Venture Lab VIP-X Spring 2026 post names {person} as a founder of {cname}. No class year is printed for this person.",
                    excerpt,
                    None,
                    known,
                )
            )
        row = company(
            cname,
            None,
            None,
            VIPX_SPRING,
            f"Venture Lab VIP-X Philly Spring 2026 lists {cname} with {', '.join(people)}.",
            "Penn Venture Lab VIP-X",
            ["univ_penn"],
            founders,
            "Penn Venture Lab VIP-X",
            f"The VIP-X Philly Spring 2026 post names {cname}. It does not state a dollar amount.",
        )
        if row:
            out.append(row)
    for cname, people, year_note in fall:
        founders = []
        bits = []
        for person, year in people:
            yy = f"'{str(year)[2:]}" if year else "no class year printed"
            bits.append(f"{person} {yy}")
            excerpt = (
                f"Siobhan Scott's Venture Lab VIP-X Philadelphia Fall 2025 post lists {person} ({yy}) on {cname}. "
                f"Class-year note on the post: {year_note}."
            )
            founders.append(
                founder(
                    person,
                    "univ_penn",
                    "Penn Venture Lab VIP-X Philadelphia Fall 2025",
                    f"The VIP-X Fall 2025 post names {person} as a founder of {cname}. {year_note}.",
                    excerpt,
                    year,
                    known,
                )
            )
        row = company(
            cname,
            "Named in the Penn Venture Lab VIP-X Philadelphia Fall 2025 cohort.",
            None,
            VIPX_FALL,
            f"Venture Lab VIP-X Philadelphia Fall 2025 lists {cname}: {', '.join(bits)}.",
            "Penn Venture Lab VIP-X",
            ["univ_penn"],
            founders,
            "Penn Venture Lab VIP-X",
            f"The VIP-X Fall 2025 post names {cname}. It does not state a dollar amount.",
        )
        if row:
            out.append(row)
    return out


def michigan_rows(known: set[str]) -> tuple[list[dict], list[dict]]:
    venture = [
        ("Kusuma Collective", "Serena Ahuja", "A clothing brand that fuses artisanal craftsmanship from India with contemporary design to create pieces that are made to last, to be lived in, and to be loved across generations."),
        ("Fastflo", "Zannah Baker", "A B2B SaaS hiring platform that revolutionizes frontline recruiting by moving the entire process into candidates' messaging apps."),
        ("Tinu AI", "Kelvin Chang", "Your organization's continuous memory. Lightweight journaling and AI summaries transform daily work into a living knowledge graph, ensuring the why behind decisions never leaves the organization."),
        ("Roxbury", "Samuel Deutsch", "A fintech platform modernizing nightlife payments through prepaid digital bar tabs."),
        ("BasisEdge", "William Furge", "Aims to give traders and farmers unprecedented clarity on when and where to move grain in the fragmented agricultural industry."),
        ("Rupay Bachao", "Ishika Gupta", "An e-commerce platform designed to boost your business's sales through cashless transactions and goods to goods exchange trading."),
        ("Krik Krak", "Jaenelle Lauture", "An educational platform designed to close the gap between school reading instruction and parental support at home."),
        ("OuterEdge", "Ryan Lynn", "Helps entrepreneurs and businesses leverage AI and other emerging technologies to ideate, launch, and scale what's next."),
        ("goTeff", "Saron Mechale", "Disrupting the industry of nutrition for endurance athletes and health-conscious consumers by offering snacks made from Teff, the superfood that fuels world champion Ethiopian runners."),
        ("Puffin Air Purifiers", "Rachel Silcox", "Designed with novel filtration technology to reduce CO2 and other gaseous pollutant levels in stuffy air filled indoor spaces, in order to boost people's productivity and wellness."),
        ("Skala", "Shalin Zarboulas", "Connects high school students with college students for personalized and authentic conversations and insightful campus tours."),
    ]
    companies = []
    for cname, person, desc in venture:
        campuses = ["univ_michigan", "univ_harvard"] if cname == "Fastflo" else ["univ_michigan"]
        excerpt = f"The 2025-2026 Zell Entrepreneurs page lists {person} on {cname}. {desc}"
        row = company(
            cname,
            desc,
            None,
            ZELL,
            excerpt,
            "Zell Entrepreneurs 2025-26",
            campuses,
            [
                founder(
                    person,
                    "univ_michigan",
                    "Zell Entrepreneurs 2025-26 venture track, University of Michigan",
                    f"The Zell Lurie Institute 2025-26 venture-track page names {person} with {cname}. No class year is printed.",
                    excerpt,
                    None,
                    known,
                )
            ],
            "Zell Lurie Institute",
            f"The Zell Entrepreneurs 2025-26 page names {cname}. It does not state a dollar amount.",
        )
        if row:
            companies.append(row)
    eta = [
        ("Gunn Lakdee", "The page lists Gunn Lakdee on Accelerate Blue Foundry as a founding member of a U-M technology, and does not name a separate company."),
        ("Kenny Berrouet", "Pursuing traditional Search in compliance-driven, labor-intensive B2B service companies."),
        ("Benton Boeck", "Pursuing blue-collar or drone-based businesses in a tier 2 city in the US."),
        ("Christopher Corbett", "Pursuing opportunities in Michigan and the Great Lakes region within the marine, environmental, and safety sectors."),
        ("Ebbin Daniel", "Pursuing opportunities in Manufacturing Services and Healthcare Services in the US."),
        ("Mahsa Javadi", "Pursuing lower middle-market healthcare and business services companies in the United States."),
        ("Tyler Jensen", "Pursuing all opportunities in the Southeast region of the US."),
        ("Noah Kim", "Pursuing industrial outdoor storage businesses in the Midwest."),
        ("Brian Lipchik", "Pursuing all industries with a preference for B2B services and blue-collar sectors in the Phoenix Metro Area."),
        ("Bryce Masterson", "Pursuing opportunities in the US for Digital Asset Assurance, Cybersecurity, or Infrastructure Construction Services."),
    ]
    potentials = []
    for person, text in eta:
        excerpt = f"The 2025-2026 Zell Entrepreneurs page lists {person}. {text}"
        row = potential(
            person,
            "univ_michigan",
            "Zell Entrepreneurs 2025-26, University of Michigan",
            f"stealth or potential founder. The Zell Lurie 2025-26 page names {person} and does not name a launched product. {text}",
            "Zell Entrepreneurs 2025-26",
            ZELL,
            excerpt,
            known,
        )
        if row:
            potentials.append(row)
    return companies, potentials


def mit_rows(known: set[str]) -> list[dict]:
    out = []
    ground_people = ["Wil Jones", "Zoe Voss Lee"]
    founders = []
    for person in ground_people:
        excerpt = (
            f"The 2025 MIT delta v page says co-founders {person} met at MIT and founded Ground3d, "
            "a digital tool for crowdsourcing hyperlocal environmental data."
        )
        founders.append(
            founder(
                person,
                "univ_mit",
                "MIT delta v 2025",
                f"The 2025 delta v page says {person} is a co-founder of Ground3d and met at MIT. No class year is printed.",
                excerpt,
                None,
                known,
            )
        )
    row = company(
        "Ground3d",
        "A digital tool for crowdsourcing hyperlocal environmental data, beginning with street-level documentation of cloudburst events in NYC.",
        "https://ground3d.xyz",
        DELTA,
        "MIT delta v 2025 lists Ground3d. Co-founders Wil Jones and Zoe Voss Lee met at MIT.",
        "MIT delta v 2025",
        ["univ_mit"],
        founders,
        "MIT delta v",
        "The 2025 delta v page lists Ground3d. It does not state a dollar amount.",
    )
    if row:
        out.append(row)

    lookbook_teams = [
        (
            "Clima Technologies",
            "An AI assistant that lets facilities managers talk to commercial buildings and act on fault diagnostics.",
            "https://climatechnologies.ai",
            [("Daniel Agudelo", 2025), ("Carlos Gosen", 2025)],
            "The Investor Day 2025 lookbook lists Daniel Agudelo, MIT Sloan MBA '25, and Carlos Gosen, MIT Sloan MBA '25, on Clima Technologies.",
        ),
        (
            "Forma Systems",
            "Generative optimization software for code-compliant, fabrication-ready construction designs.",
            "https://forma-systems.com",
            [("Alexander Curth", 2025), ("Kiley Feickert", 2025)],
            "The Investor Day 2025 lookbook lists Alexander Curth, MIT PhD '25, and Kiley Feickert, MIT PhD '25, on Forma Systems.",
        ),
        (
            "GrowthFactor",
            "An AI-powered software platform and fractional real estate analyst for commercial retail site selection.",
            "https://growthfactor.ai",
            [("Clyde Anderson", 2025), ("Raj Shrimali", 2025), ("Samuel Hall", 2025)],
            "The Investor Day 2025 lookbook lists Clyde Anderson, Raj Shrimali, and Samuel Hall, each MIT Sloan MBA '25, on GrowthFactor.",
        ),
    ]
    for cname, desc, website, people, blurb in lookbook_teams:
        founders = []
        for person, year in people:
            excerpt = f"{blurb} This row is {person}, class year {year}, on {cname}."
            founders.append(
                founder(
                    person,
                    "univ_mit",
                    "MIT delta v 2025, MIT Sloan" if "Sloan" in blurb or cname != "Forma Systems" else "MIT delta v 2025",
                    f"The MIT Investor Day 2025 lookbook names {person} on {cname} with a 2025 MIT degree.",
                    excerpt,
                    year,
                    known,
                )
            )
        row = company(
            cname,
            desc,
            website,
            LOOKBOOK,
            f"{blurb} {desc}",
            "MIT delta v 2025",
            ["univ_mit"],
            founders,
            "MIT delta v",
            f"The Investor Day 2025 lookbook lists {cname} in the delta v cohort. It does not state a dollar amount on this page.",
        )
        if row:
            out.append(row)
    return out


def cmu_rows(known: set[str]) -> tuple[list[dict], list[dict]]:
    # Faculty-labeled founders are omitted. Everyone else is partial: the page names them
    # and does not print a class year.
    named = [
        ("Analogical Engines", "Aniket Kittur, Vikram Mohanty, and Nikolas Martelaro", ["Aniket Kittur", "Vikram Mohanty", "Nikolas Martelaro"], "applies over a decade of CMU research to help R&D teams discover breakthrough innovations using computational analogies."),
        ("Avronna", "Rumi Naik", ["Rumi Naik"], "is designing custom AI chips that allow companies to optimize computing infrastructure for specialized workloads."),
        ("Basics", "Akeil Smith, Arav Bhardwaj, and team", ["Akeil Smith", "Arav Bhardwaj"], "is creating an open-source operating system template that helps organizations rapidly build and deploy internal tools."),
        ("Fordje", "Gillian Sowray", ["Gillian Sowray"], "uses AI to turn fragmented codes, zoning, and interconnection requirements into structured regulatory data."),
        ("Oryn AI", "Mosam Dabhi", ["Mosam Dabhi"], 'is building a "Large Physics Model."'),
        ("Acalia", "Michael Das", ["Michael Das"], "is using AI to improve revenue cycle management for independent physician practices."),
        ("Carob", "Alia Friedman", ["Alia Friedman"], "captures and structures clinical reasoning data to train next-generation healthcare AI systems."),
        ("Pierogi Therapeutics", "Benjamin Koby and Filipp Gusev", ["Benjamin Koby", "Filipp Gusev"], "combines AI and physics to accelerate radiopharmaceutical drug discovery."),
        ("Synapse Symphony", "Vishal Jain", ["Vishal Jain"], "is developing a non-invasive neuromodulation platform for chronic pain management."),
        ("Nth AI", "Connie Yang", ["Connie Yang"], "builds Nexus, a self-improving vertical AI agent platform for enterprise reporting workflows."),
        ("Support Vector", "Nalini Jain", ["Nalini Jain"], "uses vision-language models to guide manufacturing technicians through complex maintenance tasks."),
    ]
    companies = []
    for cname, founded_by, people, desc in named:
        founders = []
        for person in people:
            excerpt = f"CMU VentureBridge '26 says {cname}, founded by {founded_by}, {desc} This row is {person}."
            if norm_person(person) in known and person not in LINK_EXISTING:
                continue
            founders.append(
                {
                    "name": person,
                    "aliases": [],
                    "campusId": "univ_cmu",
                    "affiliationRole": "CMU VentureBridge '26",
                    "founderStatus": "founder",
                    "potentialSignal": None,
                    "verificationStatus": "partial",
                    "verificationNote": f"CMU VentureBridge '26 names {person} as a founder of {cname}. The page does not print a class year or say whether this founder is a student, an alumnus, or faculty.",
                    "excerpt": excerpt,
                }
            )
        row = company(
            cname,
            desc[0].upper() + desc[1:],
            None,
            VB,
            f"CMU VentureBridge '26 lists {cname}, founded by {founded_by}. {desc}",
            "CMU VentureBridge '26",
            ["univ_cmu"],
            founders,
            "CMU VentureBridge",
            f"The VentureBridge '26 page lists {cname} in the funded portfolio. It does not state this company's check size.",
        )
        if row:
            companies.append(row)

    fellows = [
        ("Aayush Bansal", "Aayush Bansal, PhD, Robotics, School of Computer Science, is working on an idea in stealth."),
        ("Kevin Dai", "Kevin Dai, PhD, Mechanical Engineering, is creating biocompatible 3D printing technologies for medtech prototyping."),
        ("Michael Rudow", "Michael Rudow, PhD, School of Computer Science, is developing resilient real-time data delivery systems for robots and drones."),
        ("Ron Sarma", "Ron Sarma, PhD, Chemistry, is building an AI-driven molecular energy prediction engine for computational chemistry and drug discovery."),
        ("Apoorv Singh", "Apoorv Singh, Robotics, School of Computer Science, is building an AI-first software platform that helps home inspectors streamline report generation."),
        ("David Hershenson", "David Hershenson, Electrical and Computer Engineering, is developing a wearable sensor platform for tennis and pickleball swing analysis."),
        ("Eshan Chordia", "Eshan Chordia, School of Computer Science, is creating an autonomous machine learning engineer that converts business problems into production-ready models."),
        ("Grant Wilkinson", "Grant Wilkinson, College of Engineering, is developing drone-based intelligence to manage weeds and invasive species."),
        ("Shiv Panjwani", "Shiv Panjwani, Tepper School of Business, is building an engineering project management platform for healthtech and robotics leaders."),
        ("Siddhartha Vanjari", "Siddhartha Vanjari, Electrical and Computer Engineering, is building an AI incident response engine for regulated industries."),
        ("Stephen Wu", "Stephen Wu, School of Computer Science, is building an AI-driven hedge fund using machine learning for equity signal generation."),
        ("Taranveer Singh", "Taranveer Singh, School of Computer Science, and a visiting research fellow at Berkeley AI Research Lab, is developing a human behavior simulation platform."),
    ]
    potentials = []
    for person, text in fellows:
        excerpt = f"CMU VentureBridge '26 fellows: {text}"
        row = potential(
            person,
            "univ_cmu",
            "CMU VentureBridge '26 fellow",
            f"stealth or potential founder. {text} The page does not name a company or a class year.",
            "CMU VentureBridge '26",
            VB,
            excerpt,
            known,
        )
        if row:
            # Taranveer is also a visiting fellow at Berkeley. Keep the affiliation the page leads with (CMU).
            potentials.append(row)
    return companies, potentials


def main() -> None:
    out_path = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "data/imports/v3-campus-founders-batch9.json")
    db = sqlite3.connect(DB)
    known = {norm_person(n) for (n,) in db.execute("select name from people")}
    companies = []
    potentials = []
    companies.extend(cornell_rows(known))
    companies.extend(penn_rows(known))
    mich_c, mich_p = michigan_rows(known)
    companies.extend(mich_c)
    potentials.extend(mich_p)
    companies.extend(mit_rows(known))
    cmu_c, cmu_p = cmu_rows(known)
    companies.extend(cmu_c)
    potentials.extend(cmu_p)
    payload = {
        "retrievedAt": "2026-09-27T23:10:00.000Z",
        "companies": companies,
        "potential": potentials,
        "links": [],
    }
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    people = sum(len(c["founders"]) for c in companies)
    print(f"wrote {out_path} companies {len(companies)} founders {people} potential {len(potentials)}")


if __name__ == "__main__":
    main()
