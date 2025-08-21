// ourense_2025_sheet.mjs
// Lee ES_2025_fuegos.geojson, filtra Ourense, excluye < minHa (default 30),
// calcula count, suma ha y % de Ourense (727300 ha) y escribe a Google Sheets (sobrescribe).

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

// IMPORTA TUS UTILS (ajusta la ruta si difiere)
import {
  authenticate,
  replaceSheetData,
  getTimeString,
} from "../utils/utils.js";

// ----------------- Constantes -----------------
const OURENSE_TOTAL_HA = 727300;

// ----------------- CLI -----------------
function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return {
    dataPath: out["data"] ?? "data/ES_2025_fuegos.geojson",
    sheetId: out["sheet-id"] ?? "1g6ENTuCojFNqgNqpQz5JoJE6ZCdnyO8XlXcaVkla4NQ",
    sheetName: out["sheet-name"] ?? "ourense",
    minHa: out["min-ha"] ? Number(out["min-ha"]) : 30,
  };
}

// ----------------- Helpers -----------------
function toNum(x) {
  if (x === null || x === undefined) return NaN;
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

async function loadGeoJSON(pathStr) {
  const raw = await readFile(resolve(pathStr), "utf8");
  const json = JSON.parse(raw);
  if (
    !json ||
    json.type !== "FeatureCollection" ||
    !Array.isArray(json.features)
  ) {
    throw new Error("El archivo no es un FeatureCollection válido.");
  }
  return json.features;
}

// ----------------- Core -----------------
function computeOurenseStats(features, minHa = 30) {
  // 1) Filtrar por provincia
  const ourense = features.filter((f) => f?.properties?.prov === "Ourense");

  // 2) Tomar area_ha (o area_ha_final como fallback)
  const withArea = ourense
    .map((f) => {
      const p = f?.properties ?? {};
      const a = Number.isFinite(toNum(p.area_ha))
        ? toNum(p.area_ha)
        : toNum(p.area_ha_final);
      return { areaHa: a };
    })
    .filter((x) => Number.isFinite(x.areaHa));

  // 3) Mantener solo >= minHa
  const kept = withArea.filter((x) => x.areaHa >= minHa);

  // 4) Agregados
  const count = kept.length;
  const sumHa = kept.reduce((acc, x) => acc + x.areaHa, 0);
  const percent = sumHa > 0 ? (sumHa / OURENSE_TOTAL_HA) * 100 : 0;

  return { count, sumHa, percent };
}

// ----------------- Sheets -----------------
function makeTable(stats, { minHa }) {
  const header = [
    "timestamp",
    "provincia",
    "umbral_min_ha",
    "incendios_>=umbral",
    "superficie_ha_>=umbral",
    "porcentaje_ourense_quemado",
    "superficie_total_provincia_ha",
  ];
  const row = [
    getTimeString(), // timestamp bonito "Actualizado: ..."
    "Ourense",
    minHa,
    stats.count,
    Number(stats.sumHa.toFixed(2)),
    Number(stats.percent.toFixed(6)),
    OURENSE_TOTAL_HA,
  ];
  return [header, row];
}

// ----------------- Main -----------------
async function main() {
  const args = parseArgs(process.argv);

  // 1) Datos
  const features = await loadGeoJSON(args.dataPath);

  // 2) Cálculo
  const stats = computeOurenseStats(features, args.minHa);

  // 3) Log
  console.log("Ourense 2025 — Umbral >= %d ha", args.minHa);
  console.log("Incendios:", stats.count);
  console.log("Superficie total (ha):", stats.sumHa.toFixed(2));
  console.log("Porcentaje Ourense quemado:", stats.percent.toFixed(6) + "%");

  // 4) Sheets
  const auth = await authenticate(); // usa tu SA base64 en .env
  const table = makeTable(stats, { minHa: args.minHa });

  await replaceSheetData(auth, args.sheetId, args.sheetName, table);
  console.log(
    `Hoja '${args.sheetName}' actualizada en el spreadsheet ${args.sheetId}.`
  );
}

main().catch((err) => {
  console.error("[ERROR]", err?.stack || err?.message || err);
  process.exit(1);
});
