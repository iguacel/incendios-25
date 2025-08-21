import fs from 'fs';
import { saveJson } from './utils.js';
import { getDataFromDwChart, uploadMarkersToDW } from '../utils/dw.js';

export const saveGeoJson = (data, filename) => {
    const geoJsonData = {
        type: "FeatureCollection",
        features: data.map(item => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [item.lng, item.lat]
            },
            properties: {
                title: '',
                ...item, // Spreads all properties of the item
                color: item.color || "#ff4141", // Default color if not provided
                scale: item.scale || "small", // Default scale 
            }
        }))
    };

    const filePath = `./data/${filename}.geojson`;
    fs.writeFileSync(filePath, JSON.stringify(geoJsonData, null, 2));
    console.log(`GeoJSON saved as ${filename}.geojson`);

    return filePath; // Return the file path for uploading
};

/**
 * ProcessDataForDwMarkers.
 * @param {Array} data - The array of data to be processed.
 * @returns {Array} - The processed data array with formatted properties.
//  Needs lat, lng, and 
 */
export const processDataForDwMarkers = (data) => {
    return data.map((item, i) => {
        const hasValidCoordinates = item.lat !== null && item.lng !== null;
        const coordinates = hasValidCoordinates ? [item.lng, item.lat] : [0, 0]; // Replace with a default or fallback if necessary

        if (!item.lat) console.warn("Missing lat in item:", item);
        if (!item.lng) console.warn("Missing lng in item:", item);

        // Return lat, lng, color, scale, and spread the rest of the properties
        return {
            title: item.title || '', // Add default title if missing
            id: `marker-${i}`,
            type: "point",
            icon: {
                id: "circle-sm",
                path: "M1000 350a500 500 0 0 0-500-500 500 500 0 0 0-500 500 500 500 0 0 0 500 500 500 500 0 0 0 500-500z",
                "horiz-adv-x": 1000,
                scale: 0.42,
                height: 700,
                width: 1000
            },
            scale: 1,
            markerColor: item.color || '#ff4141', // Fallback color
            markerSymbol: "",
            markerTextColor: "ff4141",
            anchor: "bottom-center",
            offsetY: 0,
            offsetX: 0,
            labelStyle: "plain",
            text: {
                bold: false,
                italic: false,
                uppercase: false,
                space: false,
                color: "#191919",
                fontSize: 14,
                halo: "#f2f3f0"
            },
            class: "",
            rotate: 0,
            visible: true,
            locked: false,
            preset: "-",
            visibility: {
                mobile: true,
                desktop: true
            },
            tooltip: {
                enabled: true,
                text: item.tooltip || 'Tip' // Fallback for missing tooltips
            },
            connectorLine: {
                enabled: false,
                arrowHead: "lines",
                type: "curveRight",
                targetPadding: 3,
                stroke: 1,
                lineLength: 0
            },
            data: {
                tooltip: item.tooltip || '',
                title: item.title || '',
                ...item
            },
            coordinates: coordinates,
            orgLatLng: coordinates
        };
    });
};



const testData = [
    {
        lng: -1.646, // Pamplona
        lat: 42.8125,
        tooltip: "Pamplona",
        data: "data",
        time: new Date().toISOString(),
    },
    {
        lng: -3.7038, // Madrid
        lat: 40.4168,
        tooltip: "Madrid",
        data: "data",
        time: new Date().toISOString(),
    },
    {
        lng: -6.2886, // Cádiz
        lat: 36.5271,
        tooltip: "Cádiz",
        data: "data",
        time: new Date().toISOString(),
    },
    {
        lng: -1.978, // San Sebastián
        lat: 43.3183,
        tooltip: "San Sebastián",
        data: "data",
        time: new Date().toISOString(),
    },
    {
        lng: -4.7286, // Valladolid
        lat: 41.6523,
        tooltip: "Valladolid",
        data: "data",
        time: new Date().toISOString(),
    }
];


// Usage: Run saveGeoJson(testData, 'test') to create 'test.geojson'
// saveGeoJson(testData, 'test');

// Process
// const processedData = processDataForDwMarkers(testData);

// const chartId = 'qWS2m';

// Saves data from chart
// saveJson(await getDataFromDwChart('qWS2m'), 'chartData');

// Upload to DW
// uploadMarkersToDW(processedData, chartId);