// scripts/export_incendios_es.mjs
// Node 18+, ESM

import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

import { authenticate, replaceSheetData } from "../utils/utils.js";

// --- Config ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

const SPREADSHEET_ID = "1g6ENTuCojFNqgNqpQz5JoJE6ZCdnyO8XlXcaVkla4NQ";
const SHEET_NAME = "incendios-es";

const YEARS = Array.from({ length: 2025 - 2016 + 1 }, (_, i) => 2016 + i);

// --- Main ---
async function main() {
  // autenticar con Google
  const auth = await authenticate();

  let allRows = [];

  for (const year of YEARS) {
    const filePath = path.join(DATA_DIR, `ES_${year}_fuegos.geojson`);
    if (!(await fs.pathExists(filePath))) {
      console.warn(`⚠️  No existe ${filePath}, se omite.`);
      continue;
    }

    console.log(`📂 Leyendo ${filePath}...`);
    const data = await fs.readJson(filePath);

    if (!data.features || data.features.length === 0) {
      console.warn(`(sin features en ${filePath})`);
      continue;
    }

    for (const f of data.features) {
      const p = f.properties || {};
      allRows.push([
        p.id || "",
        p.country || "",
        p.prov || "",
        p.mun || "",
        p.class || "",
        p.area_ha ?? "",
        p.firedate || "",
        p.lastupdate || "",
        p.fireyear || "",
        p.ccaa || "",
        p.ccaa_code || "",
      ]);
    }
  }

  if (allRows.length === 0) {
    console.error("❌ No se recogieron datos de ningún año.");
    return;
  }

  // Insertamos encabezados
  const headers = [
    "id",
    "country",
    "prov",
    "mun",
    "class",
    "area_ha",
    "firedate",
    "lastupdate",
    "fireyear",
    "ccaa",
    "ccaa_code",
  ];
  const values = [headers, ...allRows];

  console.log(`📊 Subiendo ${allRows.length} filas a Google Sheets...`);

  await replaceSheetData(auth, SPREADSHEET_ID, SHEET_NAME, values);

  console.log("✅ Datos reemplazados en la hoja:", SHEET_NAME);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
