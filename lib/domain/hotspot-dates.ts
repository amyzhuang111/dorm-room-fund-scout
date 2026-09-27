import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./hotspot-model";

export interface HotspotEvent {
  date: string;
  event: string;
  where: string;
  url: string;
}

const DATES_PATH = path.join(process.cwd(), "data/imports/v3-dates.csv");

/** The v3 Dates sheet, in workbook order. These are scouting dates, not a feed. */
export function loadHotspotEvents(): HotspotEvent[] {
  const rows = parseCsv(fs.readFileSync(DATES_PATH, "utf8"));
  return rows
    .map((row) => ({
      date: (row.Date ?? "").trim(),
      event: (row.Event ?? "").trim(),
      where: (row.Where ?? "").trim(),
      url: (row.Link ?? "").trim(),
    }))
    .filter((row) => row.date && row.event);
}
