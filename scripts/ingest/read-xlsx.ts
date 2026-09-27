import zlib from "node:zlib";

function decodeXml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function inflateZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const start = offset + 30 + nameLen + extraLen;
    const compressed = buf.subarray(start, start + compSize);
    const data = method === 0 ? Buffer.from(compressed) : method === 8 ? zlib.inflateRawSync(compressed) : null;
    if (!data) throw new Error(`unsupported zip method ${method} for ${name}`);
    out.set(name, data);
    offset = start + compSize;
  }
  return out;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const char of ref) {
    if (char < "A" || char > "Z") break;
    n = n * 26 + (char.charCodeAt(0) - 64);
  }
  return n;
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const block of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts: string[] = [];
    for (const text of block[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) parts.push(decodeXml(text[1]));
    out.push(parts.join(""));
  }
  return out;
}

export interface SheetTable {
  name: string;
  rows: string[][];
}

/** First row of each sheet is the header. Every cell is a string. */
export function readXlsxSheets(buf: Buffer): SheetTable[] {
  const files = inflateZip(buf);
  const workbook = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbook || !rels) throw new Error("xlsx is missing workbook.xml");
  const shared = sharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "");
  const targets = new Map<string, string>();
  for (const rel of rels.matchAll(/<Relationship\b([^>]+)\/>/g)) {
    const id = /Id="([^"]+)"/.exec(rel[1])?.[1];
    const target = /Target="([^"]+)"/.exec(rel[1])?.[1];
    if (!id || !target) continue;
    targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\//, "")}`);
  }
  const sheets: SheetTable[] = [];
  for (const sheet of workbook.matchAll(/<sheet\b([^>]+)\/>/g)) {
    const name = /name="([^"]+)"/.exec(sheet[1])?.[1] ?? "Sheet";
    const id = /r:id="([^"]+)"/.exec(sheet[1])?.[1];
    const path = id ? targets.get(id) : null;
    const xml = path ? files.get(path)?.toString("utf8") : null;
    if (!xml) continue;
    const cells = new Map<number, Map<number, string>>();
    let maxCol = 0;
    let maxRow = 0;
    for (const cell of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)(\d+)"/.exec(cell[1]);
      if (!ref) continue;
      const col = columnIndex(ref[1]);
      const row = Number(ref[2]);
      const kind = /t="([^"]+)"/.exec(cell[1])?.[1] ?? "";
      const body = cell[2] ?? "";
      let value = "";
      if (kind === "inlineStr") {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
        value = kind === "s" ? (shared[Number(raw)] ?? "") : decodeXml(raw);
      }
      const line = cells.get(row) ?? new Map<number, string>();
      line.set(col, value);
      cells.set(row, line);
      if (col > maxCol) maxCol = col;
      if (row > maxRow) maxRow = row;
    }
    const rows: string[][] = [];
    for (let row = 1; row <= maxRow; row++) {
      const line = cells.get(row) ?? new Map<number, string>();
      const values: string[] = [];
      for (let col = 1; col <= maxCol; col++) values.push(line.get(col) ?? "");
      if (values.some((value) => value !== "")) rows.push(values);
    }
    sheets.push({ name: decodeXml(name), rows });
  }
  return sheets;
}
