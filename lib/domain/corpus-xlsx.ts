import { cleanCsvDate, cleanCsvNames, cleanCsvText, cleanCsvUrl, cleanCsvUrls } from "../display/csv";
import type { CorpusRow } from "./corpus-explorer";
import { RELATIONSHIP_HEADERS, type RelationshipExportRow } from "./relationship-export";

export const CORPUS_XLSX_HEADERS = [
  "id",
  "name",
  "campus",
  "sector",
  "stage",
  "founded_year",
  "hq",
  "status",
  "signals",
  "latest_signal_at",
  "signal_label",
  "primary_program",
  "yc_batch",
  "founder_count",
  "founders",
  "website",
  "funding",
  "record_type",
  "scouting_status",
  "verification_status",
  "source_urls",
] as const;

/** Excel treats a leading = + - @ as a formula. Keep the characters and neutralize execution. */
export function guardFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function textCell(value: unknown): string {
  return guardFormula(cleanCsvText(value));
}

function singleHttp(value: string): string | null {
  if (!value || value.includes(" | ")) return null;
  return /^https?:\/\//i.test(value) ? value : null;
}

interface XlsxCell {
  value: unknown;
  numFmt?: string;
}
interface XlsxRow {
  getCell(index: number): XlsxCell;
  font?: unknown;
  fill?: unknown;
  alignment?: unknown;
}
interface XlsxSheet {
  addRow(values: unknown[]): XlsxRow;
  getRow(index: number): XlsxRow;
  getColumn(index: number): { width?: number };
  views?: unknown;
}
interface XlsxWorkbook {
  creator: string;
  addWorksheet(name: string, options: unknown): XlsxSheet;
  xlsx: { writeBuffer(): Promise<ArrayBuffer> };
}

function createWorkbook(imported: unknown): XlsxWorkbook {
  const record = imported as { Workbook?: new () => XlsxWorkbook; default?: { Workbook?: new () => XlsxWorkbook } };
  const Ctor = record.Workbook ?? record.default?.Workbook;
  if (!Ctor) throw new Error("exceljs Workbook missing");
  return new Ctor();
}

export async function corpusToXlsx(rows: CorpusRow[], relationships: RelationshipExportRow[] = []): Promise<Buffer> {
  const workbook = createWorkbook(await import("exceljs"));
  workbook.creator = "Campus Scout";
  const sheet = workbook.addWorksheet("Corpus", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow([...CORPUS_XLSX_HEADERS]);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FF0B0E17" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECFA" } };
  header.alignment = { vertical: "middle", wrapText: true };

  for (const row of rows) {
    const website = cleanCsvUrl(row.website);
    const sources = cleanCsvUrls(row.sourceUrls);
    const founded = row.foundedYear == null ? "" : String(row.foundedYear);
    const latest = cleanCsvDate(row.latestSignalAt);
    const added = sheet.addRow([
      textCell(row.id),
      textCell(row.name),
      textCell(row.campus),
      textCell(row.sector),
      textCell(row.stage),
      founded,
      textCell(row.hq),
      textCell(row.status),
      row.signals,
      latest,
      textCell(row.signalLabel),
      textCell(row.primaryProgram),
      textCell(row.ycBatch),
      row.founderCount,
      guardFormula(cleanCsvNames(row.founders)),
      website,
      textCell(row.fundingText),
      textCell(row.kind),
      textCell(row.scoutingStatus),
      textCell(row.verification),
      guardFormula(sources),
    ]);
    const websiteCell = added.getCell(16);
    const websiteLink = singleHttp(website);
    if (websiteLink) websiteCell.value = { text: websiteLink, hyperlink: websiteLink };
    const sourceCell = added.getCell(21);
    const sourceLink = singleHttp(sources);
    if (sourceLink) sourceCell.value = { text: sourceLink, hyperlink: sourceLink };
    added.getCell(6).numFmt = "@";
    added.getCell(10).numFmt = "@";
  }

  const widths = [28, 28, 22, 18, 16, 14, 18, 16, 10, 18, 18, 22, 16, 14, 36, 36, 22, 14, 24, 18, 48];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  if (relationships.length) {
    const people = workbook.addWorksheet("Relationships", { views: [{ state: "frozen", ySplit: 1 }] });
    people.addRow([...RELATIONSHIP_HEADERS]);
    const peopleHeader = people.getRow(1);
    peopleHeader.font = { bold: true };
    for (const item of relationships) {
      const added = people.addRow([
        textCell(item.personId),
        textCell(item.personName),
        textCell(item.projectId),
        textCell(item.role),
        textCell(item.roleClaimState),
        textCell(item.roleClaimUrl),
        textCell(item.classYear),
        textCell(item.presentEnrollment),
        textCell(item.presentReason),
        textCell(item.sourceUrl),
        textCell(item.sourceAsOf),
        textCell(item.leftSchool),
        textCell(item.storedStatus),
        textCell(item.storedBasis),
        textCell(item.relationshipId),
        textCell(item.claimId),
        textCell(item.roleExcerpt),
        textCell(item.roleRetrievedAt),
        textCell(item.enrollmentEvidenceDate),
      ]);
      for (const index of [6, 10]) {
        const value = String(added.getCell(index).value ?? "");
        const link = singleHttp(value);
        if (link) added.getCell(index).value = { text: link, hyperlink: link };
      }
    }
  }

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
