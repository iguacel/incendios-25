import fs from 'fs';
import { google } from 'googleapis';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

/**
 * Authenticates with Google APIs using a service account.
 * @returns {Promise<google.auth.OAuth2>} - The authenticated Google API client.
 */
export async function authenticate() {
    const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
    const base64Key = process.env.GCP_SERVICE_ACCOUNT_KEY;
    const keyContent = Buffer.from(base64Key, 'base64').toString('utf-8');
    const credentials = JSON.parse(keyContent);

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
    });

    const authClient = await auth.getClient();
    google.options({ auth: authClient });

    return authClient;
}

/**
 * Reads data from a Google Sheet and returns it as an array of objects.
 * @param {google.auth.OAuth2} auth - The authenticated Google API client.
 * @param {string} spreadsheetId - The ID of the Google Spreadsheet.
 * @param {string} sheetName - The name of the sheet to read from.
 * @returns {Promise<object[]>} - The sheet data as an array of objects, with headers as keys.
 */
export async function readSheet(auth, spreadsheetId, sheetName) {
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: sheetName,
        });

        const rows = result.data.values;

        if (rows && rows.length) {
            console.log(`Read ${rows.length} rows from sheet ${sheetName}.`);

            const headers = rows[0]; // First row as headers
            const jsonData = rows.slice(1).map(row => {
                let obj = {};
                headers.forEach((header, index) => {
                    obj[header] = row[index] || ''; // Set to empty string if the value is undefined
                });
                return obj;
            });

            return jsonData;
        } else {
            console.log(`No data found in sheet ${sheetName}.`);
            return [];
        }
    } catch (err) {
        console.error('Error reading data:', err);
        throw err;
    }
}

/**
 * Reads data from a Google Sheet and returns it as a 2D array.
 * @param {google.auth.OAuth2} auth - The authenticated Google API client.
 * @param {string} spreadsheetId - The ID of the Google Spreadsheet.
 * @param {string} sheetName - The name of the sheet to read from.
 * @returns {Promise<string[][]>} - The sheet data as a 2D array.
 */
export async function readSheetArray(auth, spreadsheetId, sheetName) {
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: sheetName,
        });

        const rows = result.data.values;
        if (rows && rows.length) {
            console.log(`Read ${rows.length} rows from sheet ${sheetName}.`);
            return rows;
        } else {
            console.log(`No data found in sheet ${sheetName}.`);
            return [];
        }
    } catch (err) {
        console.error('Error reading data:', err);
        throw err;
    }
}

/**
 * Updates data in a Google Sheet.
 * @param {google.auth.OAuth2} auth - The authenticated Google API client.
 * @param {string} spreadsheetId - The ID of the Google Spreadsheet.
 * @param {string} sheetName - The name of the sheet to update.
 * @param {string[][]} data - The data to update in the sheet.
 * @returns {Promise<void>}
 */
export async function updateData(auth, spreadsheetId, sheetName, data) {
    const sheets = google.sheets({ version: 'v4', auth });
    const resource = {
        values: data,
    };
    try {
        const result = await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            resource,
        });
        console.log(`${result.data.updatedCells} cells updated.`);
    } catch (err) {
        console.error('Error updating data:', err);
        throw err;
    }
}

/**
 * Replaces all data in a Google Sheet with new data.
 * @param {google.auth.OAuth2} auth - The authenticated Google API client.
 * @param {string} spreadsheetId - The ID of the Google Spreadsheet.
 * @param {string} sheetName - The name of the sheet to replace data in.
 * @param {string[][]} data - The new data to replace the old data.
 * @returns {Promise<void>}
 */
export async function replaceSheetData(auth, spreadsheetId, sheetName, data) {
    const sheets = google.sheets({ version: 'v4', auth });

    // Step 1: Clear the sheet
    try {
        await sheets.spreadsheets.values.clear({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}`, // Clearing the entire sheet
        });
        console.log(`Sheet ${sheetName} cleared.`);
    } catch (err) {
        console.error('Error clearing sheet:', err);
        return; // Exit if clearing fails
    }

    // Step 2: Update with new data
    const resource = {
        values: data,
    };

    try {
        const result = await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            resource,
        });
        console.log(`${result.data.updatedCells} cells updated.`);

        // Step 3: Resize the sheet to fit the new data
        const rowCount = data.length;
        const colCount = data[0].length;

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                requests: [
                    {
                        updateSheetProperties: {
                            properties: {
                                sheetId: await getSheetId(sheets, spreadsheetId, sheetName),
                                gridProperties: {
                                    rowCount: rowCount,
                                    columnCount: colCount,
                                },
                            },
                            fields: 'gridProperties.rowCount,gridProperties.columnCount',
                        },
                    },
                ],
            },
        });

        console.log(`Sheet ${sheetName} resized to ${rowCount} rows and ${colCount} columns.`);
    } catch (err) {
        console.error('Error updating data or resizing sheet:', err);
        throw err;
    }
}

/**
 * Helper function to get the sheet ID based on the sheet name.
 * @param {object} sheets - The Google Sheets API client.
 * @param {string} spreadsheetId - The ID of the Google Spreadsheet.
 * @param {string} sheetName - The name of the sheet.
 * @returns {Promise<number>} - The ID of the sheet.
 */
export async function getSheetId(sheets, spreadsheetId, sheetName) {
    const response = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
    });
    const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
    return sheet.properties.sheetId;
}

/**
 * Freezes the first row and column in a Google Sheet and makes the first row bold.
 * @param {google.auth.OAuth2} auth - The authenticated Google API client.
 * @param {string} spreadsheetId - The ID of the Google Spreadsheet.
 * @param {string} sheetName - The name of the sheet to modify.
 * @returns {Promise<void>}
 */
export async function freezeFirstRowAndColumn(auth, spreadsheetId, sheetName) {
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const response = await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId,
        });
        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        const sheetId = sheet.properties.sheetId;

        const requests = [
            {
                updateSheetProperties: {
                    properties: {
                        sheetId: sheetId,
                        gridProperties: {
                            frozenRowCount: 1, // Freeze the first row
                            frozenColumnCount: 1 // Freeze the first column
                        },
                    },
                    fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
                },
            },
            // Request to make the first row bold
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: 0, // First row
                        endRowIndex: 1, // Only the first row
                    },
                    cell: {
                        userEnteredFormat: {
                            textFormat: {
                                bold: true, // Apply bold
                            },
                        },
                    },
                    fields: 'userEnteredFormat.textFormat.bold',
                },
            },
        ];

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: { requests },
        });
        console.log(`First row and column frozen, and first row bolded in sheet ${sheetName}.`);
    } catch (err) {
        console.error('Error freezing first row and column and applying bold:', err);
        throw err;
    }
}

/**
 * Saves data as a text file.
 * @param {string} data - The text data to save.
 * @param {string} filename - The name of the file (without extension).
 * @returns {void}
 */
export function saveTxt(data, filename) {
    const filePath = path.join('./data', `${filename}.txt`);
    fs.writeFileSync(filePath, data, 'utf8');
    console.log(`Text data saved to ${filePath}`);
}

/**
 * Saves data as a JSON file.
 * @param {object} data - The data to save as JSON.
 * @param {string} filename - The name of the file (without extension).
 * @returns {void}
 */
export function saveJson(data, filename) {
    try {
        const jsonData = typeof data === 'string' ? JSON.parse(data) : data;
        const filePath = path.join('./data', `${filename}.json`);
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
        console.log(`Data saved to ${filePath}`);
    } catch (error) {
        console.error("Failed to save JSON data:", error);
    }
}


/**
 * Saves data as a CSV file.
 * @param {string[][]} data - The data to save as CSV.
 * @param {string} filename - The name of the file (without extension).
 * @returns {void}
 */
export function saveCsv(data, filename) {
    const filePath = path.join('./data', `${filename}.csv`);
    const csvData = data.map(row => row.join(',')).join('\n');
    fs.writeFileSync(filePath, csvData, 'utf8');
    console.log(`Data saved to ${filePath}`);
}

/**
 * Converts a date string to an ISO date format (YYYY-MM-DD).
 * @param {string} dateString - The date string to convert.
 * @returns {string} - The ISO date string.
 */
export function convertDateToISO(dateString) {
    const date = new Date(dateString);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().split('T')[0];
}


/**
 * Generates a timestamp string formatted for Spanish locale (es-ES).
 * @returns {string} - The formatted timestamp string.
 */
export const getTimeString = () => {
    const now = new Date();
    const options = {
        timeZone: 'Europe/Madrid',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };

    const formatter = new Intl.DateTimeFormat('es-ES', options);
    const formattedDate = formatter.format(now);

    return `Actualizado: ${formattedDate.replace('.', '').replace(':', '.')}.`;
};

/**
 * Removes commas from a given string.
 * @param {string} string - The string from which to remove commas.
 * @returns {string} - The string without commas.
 */
export const removeCommas = (string) => string ? string.replace(/,/g, '') : '';


/**
 * Converts a string to title case.
 * @param {string} string - The string to convert.
 * @returns {string} - The string converted to title case.
 */
export const toTitleCase = (string) => string.toLowerCase().replace(/(^\w|\s\w)/g, match => match.toUpperCase());
