// scripts/calc_stats_es_2025.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

import {
  authenticate,
  replaceSheetData,
  freezeFirstRowAndColumn,
  saveJson,
  getTimeString,
} from "../utils/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==== CONFIG ====
const INPUT_GEOJSON = path.join(
  __dirname,
  "..",
  "data",
  "ES_2025_fuegos.geojson"
);
const SPREADSHEET_ID = "1g6ENTuCojFNqgNqpQz5JoJE6ZCdnyO8XlXcaVkla4NQ";
const SHEET_NAME = "estadisticas_2025";

// Nuevo: umbral mínimo de hectáreas para incluir una feature
const MIN_HA = 30;

// ==== HELPERS ====
/** Asegura que la hoja existe; si no, la crea y devuelve sheetId */
async function ensureSheetExists(auth, spreadsheetId, sheetName) {
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const found = meta.data.sheets.find((s) => s.properties.title === sheetName);
  if (found) return found.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        },
      ],
    },
  });

  const meta2 = await sheets.spreadsheets.get({ spreadsheetId });
  const created = meta2.data.sheets.find(
    (s) => s.properties.title === sheetName
  );
  return created?.properties.sheetId;
}

/** Formatea número con decimales fijos (punto) */
function formatNum(n, decimals = 0) {
  return Number(n || 0).toFixed(decimals);
}

// ==== MAIN ====
async function main() {
  // 1) Leer GeoJSON
  if (!fs.existsSync(INPUT_GEOJSON)) {
    console.error(`No existe el archivo: ${INPUT_GEOJSON}`);
    process.exit(1);
  }
  const gj = JSON.parse(fs.readFileSync(INPUT_GEOJSON, "utf8"));
  const feats = gj.features || [];
  if (!feats.length) {
    console.error("GeoJSON vacío o sin features.");
    process.exit(1);
  }

  // ---- 0) Filtrar por umbral de hectáreas (MIN_HA) ----
  const filtered = feats.filter((f) => {
    const ha = Number(f?.properties?.area_ha ?? 0);
    return ha >= MIN_HA;
  });
  const excludedCount = feats.length - filtered.length;
  if (excludedCount > 0) {
    console.log(
      `ℹ️ Excluidas ${excludedCount} features por debajo de ${MIN_HA} ha. ` +
        `Incluidas: ${filtered.length} de ${feats.length}`
    );
  }

  // ---- 1) IDs únicos por provincia (usando SÓLO las filtradas) ----
  const byProv = new Map(); // prov -> { ha, ids:Set }

  for (const f of filtered) {
    const prov = f?.properties?.prov || "Sin provincia";
    const ha = Number(f?.properties?.area_ha ?? 0);
    const id = String(f?.properties?.id ?? "");

    if (!byProv.has(prov)) byProv.set(prov, { ha: 0, ids: new Set() });
    const rec = byProv.get(prov);
    rec.ha += ha;
    if (id) rec.ids.add(id); // num_incendios = IDs únicos >= MIN_HA
  }

  let totalHa = 0;
  let totalIncendios = 0;
  for (const [, rec] of byProv) {
    totalHa += rec.ha;
    totalIncendios += rec.ids.size;
  }

  const rows = [...byProv.entries()]
    .sort((a, b) => b[1].ha - a[1].ha)
    .map(([prov, { ha, ids }]) => {
      const pct = totalHa > 0 ? (ha / totalHa) * 100 : 0;
      return [
        prov,
        String(ids.size), // num_incendios = ids únicos (filtrados)
        formatNum(ha, 0), // area_ha
        formatNum(ha / 100, 2), // area_km2
        formatNum(pct, 2), // porcentaje_total (0–100) -> formateado como texto
      ];
    });

  const header = [
    "provincia",
    "num_incendios",
    "area_ha",
    "area_km2",
    "porcentaje_total",
  ];
  const totalRow = [
    "TOTAL",
    String(totalIncendios),
    formatNum(totalHa, 0),
    formatNum(totalHa / 100, 2),
    "100.00",
  ];
  const timeRow = ["Actualizado", getTimeString(), "", "", ""];
  const dataForSheet = [header, ...rows, totalRow, [], timeRow];

  // Guardar JSON local (opcional, útil para versionar)
  saveJson(
    {
      total_ha: Number(formatNum(totalHa, 0)),
      total_incendios: totalIncendios,
      por_provincia: rows.map((r) => ({
        prov: r[0],
        num_incendios: Number(r[1]),
        area_ha: Number(r[2]),
        area_km2: Number(r[3]),
        porcentaje_total: Number(r[4]),
      })),
      updated: getTimeString(),
      min_ha: MIN_HA,
      excluidas_bajo_umbral: excludedCount,
    },
    "estadisticas_2025"
  );

  // 5) Subir a Google Sheets
  const auth = await authenticate();
  await ensureSheetExists(auth, SPREADSHEET_ID, SHEET_NAME);
  await replaceSheetData(auth, SPREADSHEET_ID, SHEET_NAME, dataForSheet);
  await freezeFirstRowAndColumn(auth, SPREADSHEET_ID, SHEET_NAME);

  // ---- 2) Formato de celdas en Google Sheets ----
  const sheets = google.sheets({ version: "v4", auth });
  const sheetMeta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  const sheet = sheetMeta.data.sheets.find(
    (s) => s.properties.title === SHEET_NAME
  );
  const sheetId = sheet.properties.sheetId;

  // Rango total de datos (cabecera + filas + total + fila en blanco + "Actualizado")
  const nRows = dataForSheet.length;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      requests: [
        // area_ha (col C) → miles, 0 decimales
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: nRows - 2,
              startColumnIndex: 2,
              endColumnIndex: 3,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: { type: "NUMBER", pattern: "#,##0" },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        // area_km2 (col D) → 2 decimales
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: nRows - 2,
              startColumnIndex: 3,
              endColumnIndex: 4,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        // porcentaje_total (col E) → formato porcentaje con 2 decimales
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: nRows - 2,
              startColumnIndex: 4,
              endColumnIndex: 5,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: { type: "PERCENT", pattern: "0.00%" },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        // Fila TOTAL en negrita (penúltima fila con datos reales)
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: nRows - 3,
              endRowIndex: nRows - 2,
              startColumnIndex: 0,
              endColumnIndex: 5,
            },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
      ],
    },
  });

  console.log(
    `✅ Subido y formateado en Google Sheets (${SHEET_NAME}) — filas: ${nRows}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
