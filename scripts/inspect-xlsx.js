const XLSX = require("xlsx");

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/inspect-xlsx.js <path-to-xlsx>");
    process.exit(1);
  }

  const wb = XLSX.readFile(filePath, { cellDates: true });
  console.log("File:", filePath);
  console.log("Sheets:", wb.SheetNames);

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const header0 = (rows[0] || []).map((x) => String(x || "").toLowerCase().trim());
    const header1 = (rows[1] || []).map((x) => String(x || "").toLowerCase().trim());

    console.log("----");
    console.log("Sheet:", name);
    console.log("Rows:", rows.length);
    console.log("Cols (row0):", (rows[0] || []).length);
    console.log("Header row0 sample:", header0.slice(0, 20));
    console.log("Header row1 sample:", header1.slice(0, 20));
  }
}

main();

