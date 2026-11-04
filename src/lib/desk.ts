import {
  campuses,
  type Campus,
  type Coverage,
} from "@/data/campuses";

export type ScanOutcome = "confirmed" | "partial" | "opened";

export type ScanRecord = {
  id: string;
  outcome: ScanOutcome;
  note: string;
};

export type RankBand = "undergrad" | "graduate" | "mba" | "on-file";

export type RankRecord = {
  id: string;
  deskRank: number;
  band: RankBand;
  listLabel: string;
  reason: string;
};

const bandOrder: Record<RankBand, number> = {
  undergrad: 0,
  graduate: 1,
  mba: 2,
  "on-file": 3,
};

export function bandOf(campus: Campus): RankBand {
  if (campus.undergrad) return "undergrad";
  if (campus.grad) return "graduate";
  if (campus.mba) return "mba";
  return "on-file";
}

function count(n: number, word: string) {
  return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
}

export function formatChecked(iso: string | null) {
  if (!iso) return "no check date on file";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function scanCampus(campus: Campus): ScanRecord {
  if (campus.coverage === "up_to_date") {
    return {
      id: campus.id,
      outcome: "confirmed",
      note: `Confirmed. ${count(campus.sourcesConfigured, "source")} configured and ${count(campus.founderCount, "founder")} on file. Last checked ${formatChecked(campus.lastCheckedAt)} ET.`,
    };
  }
  if (campus.coverage === "partial") {
    return {
      id: campus.id,
      outcome: "partial",
      note: `Partial file held. ${count(campus.founderCount, "founder")} and ${count(campus.sourcesConfigured, "source")} are on file, last checked ${formatChecked(campus.lastCheckedAt)} ET. Remaining names stay unresolved.`,
    };
  }
  const parts: string[] = [];
  if (campus.founderCount > 0) {
    parts.push(
      `${count(campus.founderCount, "founder")} already on file, and no source is configured`,
    );
  } else {
    parts.push("No founders and no sources were configured");
  }
  if (campus.undergrad) {
    parts.push(
      `PitchBook undergraduate #${campus.undergrad.rank} lists ${campus.undergrad.founderCount.toLocaleString("en-US")} founders`,
    );
  } else if (campus.grad) {
    parts.push(
      `PitchBook graduate #${campus.grad.rank} is the published list for this campus`,
    );
  } else if (campus.mba) {
    parts.push(
      `PitchBook MBA #${campus.mba.rank} is the published list for this campus`,
    );
  } else {
    parts.push(
      "PitchBook has no undergraduate, graduate, or MBA rank for this campus",
    );
  }
  return {
    id: campus.id,
    outcome: "opened",
    note: `Scanned. ${parts.join(". ")}.`,
  };
}

export function scanAll(list: Campus[] = campuses): ScanRecord[] {
  return list.map(scanCampus);
}

function listNumber(campus: Campus, band: RankBand) {
  if (band === "undergrad") return campus.undergrad?.rank ?? 10_000;
  if (band === "graduate") return campus.grad?.rank ?? 10_000;
  if (band === "mba") return campus.mba?.rank ?? 10_000;
  return 10_000;
}

export function rankAll(list: Campus[] = campuses): RankRecord[] {
  const sorted = [...list].sort((a, b) => {
    const bandA = bandOf(a);
    const bandB = bandOf(b);
    if (bandOrder[bandA] !== bandOrder[bandB]) {
      return bandOrder[bandA] - bandOrder[bandB];
    }
    const rankA = listNumber(a, bandA);
    const rankB = listNumber(b, bandB);
    if (rankA !== rankB) return rankA - rankB;
    if (b.founderCount !== a.founderCount) {
      return b.founderCount - a.founderCount;
    }
    if (b.companyCount !== a.companyCount) {
      return b.companyCount - a.companyCount;
    }
    return a.name.localeCompare(b.name);
  });

  return sorted.map((campus, index) => {
    const band = bandOf(campus);
    let listLabel = "On file";
    let reason = `No PitchBook list rank. Placed by founders on file (${campus.founderCount.toLocaleString("en-US")}), then companies (${campus.companyCount.toLocaleString("en-US")}).`;
    if (band === "undergrad" && campus.undergrad) {
      listLabel = `UG #${campus.undergrad.rank}`;
      reason = `PitchBook undergraduate #${campus.undergrad.rank} (${campus.undergrad.founderCount.toLocaleString("en-US")} founders in the published count). Desk order follows that list.`;
    } else if (band === "graduate" && campus.grad) {
      listLabel = `GR #${campus.grad.rank}`;
      reason = `PitchBook graduate #${campus.grad.rank}. Placed after every campus that has an undergraduate rank.`;
    } else if (band === "mba" && campus.mba) {
      listLabel = `MBA #${campus.mba.rank}`;
      reason = `PitchBook MBA #${campus.mba.rank}. Placed after the undergraduate and graduate lists.`;
    }
    return {
      id: campus.id,
      deskRank: index + 1,
      band,
      listLabel,
      reason,
    };
  });
}

export function coverageLabel(coverage: Coverage) {
  if (coverage === "up_to_date") return "Up to date";
  if (coverage === "partial") return "Partial";
  return "Not scanned";
}

export function outcomeLabel(outcome: ScanOutcome) {
  if (outcome === "confirmed") return "Up to date";
  if (outcome === "partial") return "Partial";
  return "Scanned";
}

export const founderTotal = campuses.reduce(
  (sum, campus) => sum + campus.founderCount,
  0,
);

export const monitoredTotal = campuses.filter(
  (campus) => campus.coverage !== "not_scanned",
).length;
