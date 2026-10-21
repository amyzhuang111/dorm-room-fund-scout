// Idempotent campus, identity, and enrollment fixes.
// Re-run after a rebase: missing rows are skipped and audit keys are unique.
//
// Mayfield: Stanford STVP is the current Mayfield Fellows Program
// (https://stvp.stanford.edu/students/fellows-programs/mayfield-fellows-program,
// 12 Stanford undergraduates or co-terms a year). A UC Berkeley Lester Center
// program of the same name is documented through 2012
// (https://www.ischool.berkeley.edu/news/2011/vimal-kini-awarded-2012-mayfield-fellowship)
// and is not stored. Mayfield AI Garage (https://www.mayfield.com/ai-garage-at-berkeley/)
// is a different Berkeley program and is not this entity.

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { mergeRecordedPair } from "../../lib/domain/dedupe";

const CHECKED_ON = "2026-09-27";

type CampusRule = {
  projectId: string;
  allowed: readonly string[];
  evidenceUrl: string;
  reason: string;
  note: string;
};

const CAMPUS_RULES: CampusRule[] = [
  {
    projectId: "proj_mayfield_fellows",
    allowed: ["univ_stanford"],
    evidenceUrl: "https://stvp.stanford.edu/students/fellows-programs/mayfield-fellows-program",
    reason: "STVP says the Mayfield Fellows Program is open only to active Stanford undergraduates or co-terms, 12 a year.",
    note: "Stanford STVP Mayfield Fellows Program. A historical Berkeley Lester Center fellowship (press through 2012) is not a current entity. Mayfield AI Garage is a different Berkeley program and is not this row.",
  },
  {
    projectId: "proj_farmhouse",
    allowed: ["univ_stanford"],
    evidenceUrl: "https://www.thefarm.haus/",
    reason: "Farmhouse is a Stanford founder house.",
    note: "Campus is Stanford, the house named on thefarm.haus.",
  },
  {
    projectId: "proj_yale_hacker_house",
    allowed: ["univ_yale"],
    evidenceUrl: "https://www.yalehackerhouse.com/",
    reason: "Yale Hacker House is a Yale program.",
    note: "Campus is Yale, the house named on yalehackerhouse.com.",
  },
  {
    projectId: "proj_gatech_hacker_house",
    allowed: ["univ_gatech"],
    evidenceUrl: "https://news.gatech.edu/news/2025/04/11/computing-student-launches-first-ever-hacker-house-campus",
    reason: "Georgia Tech news describes the on-campus hacker house.",
    note: "Campus is Georgia Tech, from the Georgia Tech news page.",
  },
  {
    projectId: "proj_rice_residency",
    allowed: ["univ_rice"],
    evidenceUrl: "https://www.riceresidency.com/",
    reason: "Rice Residency is the Rice founder house.",
    note: "Campus is Rice. This is not The Residency (livetheresidency.com).",
  },
  {
    projectId: "proj_contrary_venture_partners",
    allowed: [],
    evidenceUrl: "https://contrary.com/blog/class-of-2026",
    reason: "Contrary's student partner class is national. Member schools had been copied onto the program.",
    note: "National program. Member campuses stay on the people, not on the program.",
  },
  {
    projectId: "proj_emergent_ventures",
    allowed: [],
    evidenceUrl: "https://marginalrevolution.com/marginalrevolution/2018/09/emergent-ventures-new-project-help-foment-enlightenment.html",
    reason: "Emergent Ventures is a Mercatus grant program, not a single campus. Member schools had been copied onto the program.",
    note: "National grant program. Member campuses stay on the people.",
  },
  {
    projectId: "proj_founders_inc",
    allowed: [],
    evidenceUrl: "https://f.inc/",
    reason: "Founders Inc is a San Francisco program (f.inc). Member schools had been copied onto the program. The UIUC club Founders is a different organization (foundersillinois.org).",
    note: "San Francisco program. Not affiliated with a member's university, and not the UIUC Founders club.",
  },
  {
    projectId: "proj_south_park_commons",
    allowed: [],
    evidenceUrl: "https://www.southparkcommons.com/",
    reason: "South Park Commons is a San Francisco community. Member schools had been copied onto the program.",
    note: "San Francisco community. Member campuses stay on the people.",
  },
  {
    projectId: "proj_z_fellows",
    allowed: [],
    evidenceUrl: "https://www.zfellows.com/",
    reason: "Z Fellows is a national fellowship. Member schools had been copied onto the program.",
    note: "National fellowship. Member campuses stay on the people.",
  },
  {
    projectId: "proj_kleiner_perkins_fellows",
    allowed: [],
    evidenceUrl: "https://jobs.ashbyhq.com/kleinerperkinsfellows",
    reason: "Kleiner Perkins Fellows is a national fellowship. A Penn member's school had been copied onto the program.",
    note: "National fellowship. Member campuses stay on the people.",
  },
  {
    projectId: "proj_foundher_house",
    allowed: [],
    evidenceUrl: "https://www.foundherhouse.org/",
    reason: "FoundHer House is a San Francisco founder house. A USC member's school had been copied onto the program.",
    note: "San Francisco house. Not a USC program.",
  },
  {
    projectId: "proj_harvard_st_commons",
    allowed: [],
    evidenceUrl: "https://harvardst.co/",
    reason: "harvardst.co is a Cambridge founder house. BU, Michigan, and Rice are schools of named residents, not a university affiliation. It is not an official Harvard University program.",
    note: "Cambridge founder house. Resident schools stay on the people. Not recorded as a Harvard University program.",
  },
  {
    projectId: "proj_the_residency",
    allowed: [],
    evidenceUrl: "https://www.livetheresidency.com/residencies",
    reason: "The Residency (livetheresidency.com) is a multi-city house network. A Rice student's membership had been copied onto the program. Rice Residency is a separate project.",
    note: "Multi-city house network. Not Rice Residency.",
  },
];

function auditId(key: string): string {
  return `audit_${crypto.createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
}

function record(db: ReturnType<typeof getDb>, key: string, entityType: string, entityId: string, action: string, field: string, oldValue: string | null, newValue: string | null, reason: string, evidenceUrl: string) {
  db.prepare(
    `INSERT OR IGNORE INTO accuracy_audit (id, entity_type, entity_id, action, field, old_value, new_value, reason, evidence_url, checked_at, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(auditId(key), entityType, entityId, action, field, oldValue, newValue, reason, evidenceUrl, CHECKED_ON, key);
}

function claimReferenced(db: ReturnType<typeof getDb>, claimId: string): boolean {
  const queries = [
    `SELECT 1 AS n FROM person_project_roles WHERE claim_id = ?`,
    `SELECT 1 AS n FROM affiliations WHERE claim_id = ?`,
    `SELECT 1 AS n FROM program_signals WHERE claim_id = ?`,
    `SELECT 1 AS n FROM funding_events WHERE claim_id = ?`,
    `SELECT 1 AS n FROM precollege_signals WHERE claim_id = ?`,
  ];
  return queries.some((sql) => db.prepare(sql).get(claimId));
}

function main() {
  const db = getDb();
  const counts = {
    campusLinksRemoved: 0,
    campusClaimsRemoved: 0,
    peopleMerged: 0,
    enrollmentFixed: 0,
    projectsUpdated: 0,
    sourcesUpdated: 0,
  };

  const tx = db.transaction(() => {
    for (const rule of CAMPUS_RULES) {
      const project = db.prepare(`SELECT id, name, verification_note FROM projects WHERE id = ?`).get(rule.projectId) as
        | { id: string; name: string; verification_note: string | null }
        | undefined;
      if (!project) continue;
      const allowed = new Set(rule.allowed);
      const links = db
        .prepare(
          `SELECT id, target_entity_id FROM relationships
           WHERE source_entity_type = 'project' AND source_entity_id = ? AND target_entity_type = 'university' AND relationship_type = 'affiliated_with'`
        )
        .all(rule.projectId) as { id: string; target_entity_id: string }[];
      for (const link of links) {
        if (allowed.has(link.target_entity_id)) continue;
        db.prepare(`DELETE FROM relationships WHERE id = ?`).run(link.id);
        counts.campusLinksRemoved += 1;
        record(
          db,
          `campus-link:${rule.projectId}:${link.target_entity_id}`,
          "project",
          rule.projectId,
          "fix",
          "affiliated_with",
          link.target_entity_id,
          null,
          rule.reason,
          rule.evidenceUrl
        );
      }
      const claims = db
        .prepare(`SELECT id, value_json FROM claims WHERE entity_type = 'project' AND entity_id = ? AND claim_type = 'campus_affiliation'`)
        .all(rule.projectId) as { id: string; value_json: string }[];
      for (const claim of claims) {
        let universityId = "";
        try {
          universityId = (JSON.parse(claim.value_json) as { universityId?: string }).universityId ?? "";
        } catch {
          universityId = "";
        }
        if (allowed.has(universityId)) continue;
        if (claimReferenced(db, claim.id)) continue;
        db.prepare(`DELETE FROM claims WHERE id = ?`).run(claim.id);
        counts.campusClaimsRemoved += 1;
        record(
          db,
          `campus-claim:${claim.id}`,
          "project",
          rule.projectId,
          "fix",
          "campus_affiliation",
          universityId || claim.value_json,
          null,
          rule.reason,
          rule.evidenceUrl
        );
      }
      if (!project.verification_note) {
        db.prepare(
          `UPDATE projects SET verification_status = 'confirmed', last_verified_at = ?, verification_note = ?, updated_at = ? WHERE id = ?`
        ).run(CHECKED_ON, rule.note, nowIso(), rule.projectId);
        counts.projectsUpdated += 1;
      }
    }

    const mayfield = db.prepare(`SELECT signal_tier, aliases_json, website_url FROM projects WHERE id = 'proj_mayfield_fellows'`).get() as
      | { signal_tier: string | null; aliases_json: string; website_url: string | null }
      | undefined;
    if (mayfield) {
      const aliases = new Set<string>();
      try {
        const parsed = JSON.parse(mayfield.aliases_json || "[]") as unknown;
        if (Array.isArray(parsed)) for (const alias of parsed) if (typeof alias === "string") aliases.add(alias);
      } catch {
        // keep the new aliases
      }
      for (const alias of ["Mayfield Fellows Organization", "Mayfield Fellow Program", "MFP"]) aliases.add(alias);
      const nextAliases = JSON.stringify([...aliases]);
      const basis =
        "Directory tier S. STVP admits 12 Stanford undergraduates or co-terms a year (https://stvp.stanford.edu/students/fellows-programs/mayfield-fellows-program). Person-level tiers are unchanged.";
      if (mayfield.signal_tier !== "S" || mayfield.aliases_json !== nextAliases) {
        db.prepare(`UPDATE projects SET signal_tier = 'S', signal_tier_basis = ?, aliases_json = ?, updated_at = ? WHERE id = 'proj_mayfield_fellows'`).run(
          basis,
          nextAliases,
          nowIso()
        );
        counts.projectsUpdated += 1;
        record(
          db,
          "mayfield:canonical",
          "project",
          "proj_mayfield_fellows",
          "fix",
          "signal_tier",
          mayfield.signal_tier,
          "S",
          "One Stanford STVP program. Search aliases cover the program and organization labels. No Berkeley Fellows row is stored.",
          "https://stvp.stanford.edu/students/fellows-programs/mayfield-fellows-program"
        );
      }
    }

    const deltav = db.prepare(`SELECT website_url FROM projects WHERE id = 'proj_mit_deltav'`).get() as { website_url: string | null } | undefined;
    const deltavCanonical = "https://entrepreneurship.mit.edu/accelerator/program/";
    if (deltav && deltav.website_url === "https://entrepreneurship.mit.edu/accelerator/") {
      db.prepare(`UPDATE projects SET website_url = ?, updated_at = ? WHERE id = 'proj_mit_deltav'`).run(deltavCanonical, nowIso());
      counts.projectsUpdated += 1;
      record(
        db,
        "mit-deltav:website",
        "project",
        "proj_mit_deltav",
        "fix",
        "website_url",
        deltav.website_url,
        deltavCanonical,
        "The Martin Trust Center accelerator page redirects to /accelerator/program/.",
        deltavCanonical
      );
    }

    const contrary = db.prepare(`SELECT campuses_json FROM sources WHERE id = 'src_contrary_venture_partners'`).get() as { campuses_json: string } | undefined;
    if (contrary && contrary.campuses_json !== "[]") {
      db.prepare(`UPDATE sources SET campuses_json = '[]' WHERE id = 'src_contrary_venture_partners'`).run();
      counts.sourcesUpdated += 1;
      record(
        db,
        "source:contrary:campuses",
        "source",
        "src_contrary_venture_partners",
        "fix",
        "campuses_json",
        contrary.campuses_json,
        "[]",
        "The class-of-2026 page is the national Contrary student partner roster, not a Penn-only source.",
        "https://contrary.com/blog/class-of-2026"
      );
    }

    const merged = mergeRecordedPair(
      db,
      "person",
      "person_6p2ELmfBpFG5",
      "person_53QbVHf8Saoo",
      "Same LinkedIn slug julianweng and the same Penn name. Survivor keeps the current-student row."
    );
    if (merged) {
      counts.peopleMerged += 1;
      record(
        db,
        "merge:person:person_53QbVHf8Saoo",
        "person",
        "person_6p2ELmfBpFG5",
        "merge",
        "id",
        "person_53QbVHf8Saoo",
        "person_6p2ELmfBpFG5",
        "Both rows store https://www.linkedin.com/in/julianweng and the name Julian Weng at Penn.",
        "https://www.linkedin.com/in/julianweng"
      );
    }
  });

  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(JSON.stringify(counts));
}

main();
