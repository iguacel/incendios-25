import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { saveJson } from "./utils.js";

/**
 * Converts a CSV file to JSON using the `csv-parser` library.
 * @param {string} csvFilePath - The path to the CSV file.
 * @returns {Promise<object[]>} - The parsed data as an array of objects.
 */
export async function csvToJson(csvFilePath) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => {
        resolve(results);
      })
      .on("error", (error) => {
        reject(`Error parsing CSV: ${error.message}`);
      });
  });
}


// Example usage:
async function convertAndSave() {
  try {
    const jsonData = await csvToJson("./data/sample.csv");
    saveJson(jsonData, "output");
  } catch (error) {
    console.error(error);
  }
}

convertAndSave();

/**
 * Recursively converts string values to their appropriate types (e.g., numbers, booleans).
 * @param {any} value - The value to be processed.
 * @returns {any} - The value with the appropriate type.
 */
export function parseValue(value) {
  if (Array.isArray(value)) {
    return value.map(parseValue);
  } else if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, parseValue(val)])
    );
  } else if (!isNaN(value) && value.trim() !== '') {
    return Number(value);
  } else if (value.toLowerCase() === 'true') {
    return true;
  } else if (value.toLowerCase() === 'false') {
    return false;
  } else {
    return value;
  }
}

/**
 * Converts a JavaScript object to a string with unquoted property names.
 * @param {object} obj - The object to convert.
 * @returns {string} - The string representation of the object with unquoted properties.
 */
export function objectToJsString(obj) {
  if (Array.isArray(obj)) {
    return `[${obj.map(objectToJsString).join(", ")}]`;
  } else if (typeof obj === 'object' && obj !== null) {
    const entries = Object.entries(obj)
      .map(([key, value]) => `${key}: ${objectToJsString(value)}`);
    return `{ ${entries.join(", ")} }`;
  } else if (typeof obj === 'string') {
    return `"${obj}"`;
  } else {
    return String(obj);
  }
}

/**
 * Saves data as a JavaScript file with unquoted properties.
 * @param {object} data - The data to save as a JavaScript file.
 * @param {string} filename - The name of the file (without extension).
 * @returns {void}
 */
export function saveAsJavascript(data, filename) {
  const parsedData = parseValue(data);
  const filePath = path.join("./data", `${filename}.js`);
  const jsContent = `export const data = ${objectToJsString(parsedData)};`;

  fs.writeFileSync(filePath, jsContent, "utf8");
  console.log(`Data saved to ${filePath} as a JavaScript file with unquoted properties.`);
}

// Example usage:
async function convertAndSaveAsJs() {
  try {
    const jsonData = await csvToJson("./data/sample.csv");
    saveAsJavascript(jsonData, "output");
  } catch (error) {
    console.error(error);
  }
}

convertAndSaveAsJs();