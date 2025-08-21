// scripts/ccaa_evolution.mjs
// Lee data/ES_YYYY_fuegos.geojson (>=2015), agrega area_ha por CCAA y año,
// (filtrando features con area_ha < MIN_HA) y sube la tabla a Google Sheets con formateo.

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

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_REGEX = /^ES_(\d{4})_fuegos\.geojson$/i;

// ---- CONFIG ----
const MIN_YEAR = 2015; // “desde 2015”
const SPREADSHEET_ID = "1g6ENTuCojFNqgNqpQz5JoJE6ZCdnyO8XlXcaVkla4NQ";
const SHEET_NAME = "evolucion_ccaa_2015_2025";

// Nuevo: umbral mínimo de hectáreas para incluir una feature
const MIN_HA = 30;

// ---- HELPERS ----
function formatNum(n, decimals = 0) {
  return Number(n || 0).toFixed(decimals);
}

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

function listYearFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => {
      const m = name.match(FILE_REGEX);
      if (!m) return null;
      const year = Number(m[1]);
      if (!Number.isInteger(year) || year < MIN_YEAR) return null;
      return { year, path: path.join(dir, name) };
    })
    .filter(Boolean)
    .sort((a, b) => a.year - b.year);
}

// ---- MAIN ----
async function main() {
  // 1) Encontrar ficheros ES_YYYY_fuegos.geojson (>= MIN_YEAR)
  const files = listYearFiles(DATA_DIR);
  if (files.length === 0) {
    console.error(
      `No se encontraron ficheros ES_YYYY_fuegos.geojson >= ${MIN_YEAR} en ${DATA_DIR}`
    );
    process.exit(1);
  }
  console.log(
    `Encontrados ${files.length} ficheros:`,
    files.map((f) => path.basename(f.path)).join(", ")
  );

  // 2) Agregación: clave = `${year}|${ccaa_code}|${ccaa}`
  const acc = new Map(); // key -> { year, ccaa_code, ccaa, ha, ids:Set }

  // Contadores de control
  const excludedByYear = new Map(); // year -> count
  const includedByYear = new Map(); // year -> count

  for (const { year, path: filePath } of files) {
    const gj = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const feats = gj.features || [];
    let excl = 0;
    let incl = 0;

    for (const f of feats) {
      const p = f?.properties || {};
      if (p.country !== "ES") continue; // redundante, por si acaso

      const ha = Number(p.area_ha ?? 0);
      if (ha < MIN_HA) {
        excl++;
        continue; // FILTRO: ignorar features por debajo del umbral
      }

      incl++;

      const ccaa = p.ccaa || "Sin CCAA";
      const ccaa_code = p.ccaa_code || "";
      const id = String(p.id ?? "");

      const key = `${year}|${ccaa_code}|${ccaa}`;
      if (!acc.has(key))
        acc.set(key, { year, ccaa_code, ccaa, ha: 0, ids: new Set() });
      const rec = acc.get(key);
      rec.ha += ha;
      if (id) rec.ids.add(id); // num_incendios = IDs únicos (tras filtro)
    }

    if (excl || incl) {
      excludedByYear.set(year, (excludedByYear.get(year) || 0) + excl);
      includedByYear.set(year, (includedByYear.get(year) || 0) + incl);
      console.log(
        `ℹ️ ${year}: incluidas ${incl}, excluidas < ${MIN_HA} ha: ${excl}`
      );
    }
  }

  if (acc.size === 0) {
    console.error(
      `No hay registros ES con CCAA para agregar tras aplicar MIN_HA = ${MIN_HA}.`
    );
    process.exit(1);
  }

  // 3) Construir tabla larga: ccaa_code, ccaa, year, num_incendios, area_ha, area_km2
  const rows = [...acc.values()]
    .sort(
      (a, b) =>
        a.year - b.year ||
        a.ccaa_code.localeCompare(b.ccaa_code) ||
        a.ccaa.localeCompare(b.ccaa)
    )
    .map(({ year, ccaa_code, ccaa, ha, ids }) => [
      ccaa_code || "",
      ccaa,
      String(year),
      String(ids.size),
      formatNum(ha, 0),
      formatNum(ha / 100, 2),
    ]);

  const header = [
    "ccaa_code",
    "ccaa",
    "year",
    "num_incendios",
    "area_ha",
    "area_km2",
  ];
  const timeRow = ["Actualizado", getTimeString(), "", "", "", ""];
  const dataForSheet = [header, ...rows, [], timeRow];

  // 4) Guardar respaldo JSON (incluye metadatos del filtro)
  const excludedTotal = [...excludedByYear.values()].reduce((a, b) => a + b, 0);
  const includedTotal = [...includedByYear.values()].reduce((a, b) => a + b, 0);

  // Serializamos los mapas a arrays legibles
  const exclPorAnio = [...excludedByYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year, count }));

  const inclPorAnio = [...includedByYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year, count }));

  saveJson(
    {
      desde: MIN_YEAR,
      updated: getTimeString(),
      min_ha: MIN_HA,
      excluidas_bajo_umbral_total: excludedTotal,
      incluidas_total: includedTotal,
      excluidas_bajo_umbral_por_anio: exclPorAnio,
      incluidas_por_anio: inclPorAnio,
      registros: rows.map((r) => ({
        ccaa_code: r[0],
        ccaa: r[1],
        year: Number(r[2]),
        num_incendios: Number(r[3]),
        area_ha: Number(r[4]),
        area_km2: Number(r[5]),
      })),
    },
    "evolucion_ccaa_2015_2025"
  );

  // 5) Subir a Google Sheets + formateo
  const auth = await authenticate();
  await ensureSheetExists(auth, SPREADSHEET_ID, SHEET_NAME);
  await replaceSheetData(auth, SPREADSHEET_ID, SHEET_NAME, dataForSheet);
  await freezeFirstRowAndColumn(auth, SPREADSHEET_ID, SHEET_NAME);

  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find((s) => s.properties.title === SHEET_NAME);
  const sheetId = sheet.properties.sheetId;

  const nRows = dataForSheet.length;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      requests: [
        // area_ha (col E) → miles, 0 decimales
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
                numberFormat: { type: "NUMBER", pattern: "#,##0" },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        // area_km2 (col F) → 2 decimales
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: nRows - 2,
              startColumnIndex: 5,
              endColumnIndex: 6,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        },
      ],
    },
  });

  console.log(
    `✅ Subido a Google Sheets (${SHEET_NAME}). Filas: ${dataForSheet.length}. MIN_HA=${MIN_HA}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
