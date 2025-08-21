#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// importa tus utilidades
import { authenticate, replaceSheetData } from "../utils/utils.js";

// --- CONFIG ---
const SPREADSHEET_ID = "1g6ENTuCojFNqgNqpQz5JoJE6ZCdnyO8XlXcaVkla4NQ"; // el de tu URL
const INPUT_JSON = "./data/output/autonomias_burn_2025.json"; // salida del Python

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga datos
const payload = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", INPUT_JSON), "utf-8")
);
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
    console.error("❌ Error subiendo a Google Sheets:", err.message);
    process.exit(1);
  }
})();
