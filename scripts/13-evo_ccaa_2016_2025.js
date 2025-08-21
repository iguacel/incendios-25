#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Papa from "papaparse";

// Tus utilidades
import { authenticate, replaceSheetData } from "../utils/utils.js";

// --- CONFIG ---
const SPREADSHEET_ID = "1g6ENTuCojFNqgNqpQz5JoJE6ZCdnyO8XlXcaVkla4NQ";
const SHEET_NAME = "evo-ccaa-sose";
const INPUT_CSV = "../data/output/evo_ccaa_2016_2025.csv"; // relativo a este script

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.resolve(__dirname, INPUT_CSV);
const csvText = fs.readFileSync(csvPath, "utf-8");

// Parse a matriz (primera fila = headers)
const parsed = Papa.parse(csvText.trim(), { header: false });
const data = parsed.data;

// Sube a Sheets
(async () => {
  try {
    const auth = await authenticate();
    await replaceSheetData(auth, SPREADSHEET_ID, SHEET_NAME, data);
    console.log(
      `✅ Subido a Google Sheets | hoja "${SHEET_NAME}" | filas: ${data.length}`
    );
  } catch (err) {
    console.error("❌ Error subiendo a Google Sheets:", err?.message || err);
    process.exit(1);
  }
})();
