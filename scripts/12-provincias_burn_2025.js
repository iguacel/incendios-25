#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Usa tus utilidades
import { authenticate, replaceSheetData } from "../utils/utils.js";

// --- CONFIG ---
const SPREADSHEET_ID = "1g6ENTuCojFNqgNqpQz5JoJE6ZCdnyO8XlXcaVkla4NQ";
const INPUT_JSON = "../data/output/provincias_burn_2025.json"; // relativo a este script

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const payloadPath = path.resolve(__dirname, INPUT_JSON);
const payload = JSON.parse(fs.readFileSync(payloadPath, "utf-8"));
const { sheetName, data } = payload;

if (!sheetName || !Array.isArray(data)) {
  console.error("JSON inválido. Esperaba { sheetName, data }");
  process.exit(1);
}

(async () => {
  try {
    const auth = await authenticate();
    await replaceSheetData(auth, SPREADSHEET_ID, sheetName, data);
    console.log(
      `✅ Subido a Google Sheets | hoja: "${sheetName}" | filas: ${data.length}`
    );
  } catch (err) {
    console.error("❌ Error subiendo a Google Sheets:", err?.message || err);
    process.exit(1);
  }
})();
