import {
    authenticate,
    readSheet,
    readSheetArray,
    updateData,
    replaceSheetData,
    getSheetId,
    freezeFirstRowAndColumn,
    saveTxt,
    saveJson,
    saveCsv,
    convertDateToISO,
    getTimeString,
    removeCommas,
    toTitleCase
} from "../utils/utils.js";
import { csvToJson, parseValue, saveAsJavascript } from "../utils/csv.js"
import {
    updateDwChart,
    deleteDwChart,
    publishDwChart,
    getDataFromDwChart,
    updateChartNotes,
    republishChart,
    uploadMarkersToDW
} from "../utils/dw.js";
import { saveGeoJson, processDataForDwMarkers } from "../utils/geojson.js";
import { createGist, updateGistContent } from "../utils/gists.js";


console.log("All functions imported successfully.");