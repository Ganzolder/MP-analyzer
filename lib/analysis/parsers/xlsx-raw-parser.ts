/**
 * Minimal XLSX parser without SheetJS:
 * - Reads .xlsx as ZIP
 * - Parses sharedStrings.xml and sheet1.xml
 * - Returns AOA (array-of-arrays) like XLSX.utils.sheet_to_json({header:1})
 *
 * Designed for Ozon reports where data is in the first sheet.
 */
import yauzl from "yauzl";
import sax from "sax";

export type XlsxCellValue = string | number | boolean | null;

export interface ParseXlsxRawResult {
  rows: any[][];
  hasSharedStrings: boolean;
  sharedStringsCount: number;
}

function openZipFromBuffer(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err || new Error("Failed to open zip"));
      resolve(zip);
    });
  });
}

function readZipEntriesOnce(
  zip: yauzl.ZipFile
): Promise<{
  sharedStrings: Buffer | null;
  sheets: Record<string, Buffer>;
}> {
  return new Promise((resolve, reject) => {
    let sharedStrings: Buffer | null = null;
    const sheets: Record<string, Buffer> = {};

    const readEntryStream = (entry: yauzl.Entry): Promise<Buffer> =>
      new Promise((res, rej) => {
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return rej(err || new Error("No stream"));
          const chunks: Buffer[] = [];
          stream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          stream.on("end", () => res(Buffer.concat(chunks)));
          stream.on("error", rej);
        });
      });

    const onEntry = async (entry: yauzl.Entry) => {
      try {
        if (entry.fileName === "xl/sharedStrings.xml") {
          sharedStrings = await readEntryStream(entry);
        } else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.fileName)) {
          sheets[entry.fileName] = await readEntryStream(entry);
        }
      } catch (e) {
        cleanup();
        reject(e);
        return;
      } finally {
        zip.readEntry();
      }
    };

    const cleanup = () => {
      zip.removeListener("entry", onEntry as any);
      zip.removeListener("end", onEnd);
      zip.removeListener("error", onError);
    };

    const onEnd = () => {
      cleanup();
      const keys = Object.keys(sheets);
      if (keys.length === 0) {
        reject(new Error("No worksheet xml found in xlsx"));
        return;
      }
      resolve({ sharedStrings, sheets });
    };

    const onError = (err: any) => {
      cleanup();
      reject(err);
    };

    zip.on("entry", onEntry as any);
    zip.on("end", onEnd);
    zip.on("error", onError);
    zip.readEntry();
  });
}

function colLettersToIndex(letters: string): number {
  // A -> 0, B -> 1, Z -> 25, AA -> 26
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

function parseA1(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  return { col: colLettersToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

function decodeXmlText(s: string): string {
  // Very small decode for the entities Sheet XML uses
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function bufferToXmlString(buf: Buffer): string {
  if (buf.length >= 2) {
    // UTF-16LE BOM
    if (buf[0] === 0xff && buf[1] === 0xfe) {
      return buf.toString("utf16le");
    }
    // UTF-16BE BOM
    if (buf[0] === 0xfe && buf[1] === 0xff) {
      const swapped = Buffer.allocUnsafe(buf.length - (buf.length % 2));
      for (let i = 0; i < swapped.length; i += 2) {
        swapped[i] = buf[i + 1];
        swapped[i + 1] = buf[i];
      }
      return swapped.toString("utf16le");
    }
  }

  // Heuristic: lots of NUL bytes near the start => UTF-16LE without BOM
  const sample = buf.slice(0, Math.min(200, buf.length));
  let nul = 0;
  for (const b of sample) if (b === 0x00) nul++;
  if (nul > sample.length * 0.2) {
    return buf.toString("utf16le");
  }

  return buf.toString("utf8");
}

async function parseSharedStrings(xml: string): Promise<string[]> {
  const strings: string[] = [];
  const parser = sax.parser(true, { lowercase: true, trim: false, normalize: false });

  let inSi = false;
  let inT = false;
  let current = "";

  parser.onopentag = (node) => {
    if (node.name === "si") {
      inSi = true;
      current = "";
    } else if (inSi && node.name === "t") {
      inT = true;
    }
  };

  parser.ontext = (text) => {
    if (inSi && inT) current += text;
  };

  parser.onclosetag = (name) => {
    if (name === "t") inT = false;
    if (name === "si") {
      inSi = false;
      strings.push(decodeXmlText(current));
    }
  };

  parser.write(xml).close();
  return strings;
}

async function parseSheetToAOA(xml: string, sharedStrings: string[]): Promise<any[][]> {
  const rows: any[][] = [];
  const parser = sax.parser(true, { lowercase: true, trim: false, normalize: false });

  // Some XLSX producers omit cell "r" (A1) references for <c>.
  // In that case, we infer coordinates from the current <row r="..."> and cell order.
  let currentRowIndex: number | null = null;
  let nextColIndex = 0;

  let currentCellRef: string | null = null;
  let currentCellPos: { row: number; col: number } | null = null;
  let currentCellType: string | null = null; // t attribute
  let currentValue = "";
  let inV = false;
  let inInlineT = false;
  let inIs = false;

  parser.onopentag = (node) => {
    if (node.name === "row") {
      const rAttr = (node.attributes as any).r ? String((node.attributes as any).r) : "";
      const rNum = rAttr ? parseInt(rAttr, 10) : NaN;
      if (Number.isFinite(rNum)) {
        currentRowIndex = rNum - 1;
      } else {
        currentRowIndex = currentRowIndex == null ? 0 : currentRowIndex + 1;
      }
      nextColIndex = 0;
    } else if (node.name === "c") {
      const r = (node.attributes as any).r ? String((node.attributes as any).r) : null;
      currentCellRef = r;
      currentCellType = (node.attributes as any).t ? String((node.attributes as any).t) : null;
      currentValue = "";

      if (r) {
        const pos = parseA1(r);
        currentCellPos = pos;
        if (pos) nextColIndex = pos.col + 1;
      } else if (currentRowIndex != null) {
        currentCellPos = { row: currentRowIndex, col: nextColIndex };
        nextColIndex += 1;
      } else {
        currentCellPos = null;
      }
    } else if (node.name === "v") {
      inV = true;
      currentValue = "";
    } else if (node.name === "is") {
      inIs = true;
    } else if (inIs && node.name === "t") {
      inInlineT = true;
      currentValue = "";
    }
  };

  parser.ontext = (text) => {
    if (inV || inInlineT) currentValue += text;
  };

  parser.onclosetag = (name) => {
    if (name === "v") {
      inV = false;
    } else if (name === "t" && inInlineT) {
      inInlineT = false;
    } else if (name === "is") {
      inIs = false;
    } else if (name === "c") {
      const pos = currentCellPos || (currentCellRef ? parseA1(currentCellRef) : null);
      if (pos) {
        while (rows.length <= pos.row) rows.push([]);
        const rowArr = rows[pos.row];
        while (rowArr.length <= pos.col) rowArr.push("");

        let v: XlsxCellValue = null;
        const raw = currentValue;
        if (currentCellType === "s") {
          const idx = parseInt(raw, 10);
          v = Number.isFinite(idx) ? sharedStrings[idx] ?? "" : "";
        } else if (currentCellType === "b") {
          v = raw === "1";
        } else if (currentCellType === "str" || currentCellType === "inlineStr") {
          v = decodeXmlText(raw);
        } else {
          // numeric or empty
          const n = raw === "" ? NaN : Number(raw);
          v = Number.isFinite(n) ? n : decodeXmlText(raw);
        }

        rowArr[pos.col] = v ?? "";
      }
      currentCellRef = null;
      currentCellPos = null;
      currentCellType = null;
      currentValue = "";
    }
  };

  parser.write(xml).close();
  return rows;
}

export async function parseXlsxToAOA(buffer: Buffer): Promise<ParseXlsxRawResult> {
  const zip = await openZipFromBuffer(buffer);
  try {
    const { sharedStrings: sharedStringsBuf, sheets } = await readZipEntriesOnce(zip);
    const sharedStringsXml = sharedStringsBuf ? bufferToXmlString(sharedStringsBuf) : "";

    const sharedStrings = sharedStringsXml ? await parseSharedStrings(sharedStringsXml) : [];
    const sheetNames = Object.keys(sheets).sort((a, b) => {
      const ma = /sheet(\d+)\.xml$/.exec(a);
      const mb = /sheet(\d+)\.xml$/.exec(b);
      const na = ma ? parseInt(ma[1], 10) : 999999;
      const nb = mb ? parseInt(mb[1], 10) : 999999;
      return na - nb;
    });

    let rows: any[][] = [];
    for (const sheetName of sheetNames) {
      const xml = bufferToXmlString(sheets[sheetName]);
      const parsedRows = await parseSheetToAOA(xml, sharedStrings);
      if (parsedRows.length > 0) {
        rows = parsedRows;
        break;
      }
    }

    return {
      rows,
      hasSharedStrings: Boolean(sharedStringsBuf),
      sharedStringsCount: sharedStrings.length,
    };
  } finally {
    zip.close();
  }
}

