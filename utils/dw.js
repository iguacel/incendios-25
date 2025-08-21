import dotenv from 'dotenv';
dotenv.config(); // Load environment variables
import axios from 'axios';
import { getTimeString } from '../utils/utils.js';

const dwToken = process.env.DW_TOKEN;


/**
 * Updates an existing Datawrapper chart using the DW API.
 * @param {string} chartId - The ID of the chart to update.
 * @param {Object} updateData - The data for updating the chart.
 * @returns {Promise<Object>} - A promise that resolves to the updated chart details.
 */
export const updateDwChart = async (chartId, updateData) => {
    const url = `https://api.datawrapper.de/v3/charts/${chartId}`;

    try {
        const response = await axios.patch(url, updateData, {
            headers: {
                'Authorization': `Bearer ${dwToken}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error("Failed to update chart in Datawrapper:", error);
        throw error;
    }
};

/**
 * Deletes a chart in Datawrapper using the DW API.
 * @param {string} chartId - The ID of the chart to delete.
 * @returns {Promise<void>} - A promise that resolves when the chart is deleted.
 */
export const deleteDwChart = async (chartId) => {
    const url = `https://api.datawrapper.de/v3/charts/${chartId}`;

    try {
        await axios.delete(url, {
            headers: {
                'Authorization': `Bearer ${dwToken}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`Chart with ID ${chartId} deleted successfully.`);
    } catch (error) {
        console.error("Failed to delete chart in Datawrapper:", error);
        throw error;
    }
};

/**
 * Publishes a chart in Datawrapper using the DW API.
 * @param {string} chartId - The ID of the chart to publish.
 * @returns {Promise<Object>} - A promise that resolves to the published chart details.
 */
export const publishDwChart = async (chartId) => {
    const url = `https://api.datawrapper.de/v3/charts/${chartId}/publish`;

    try {
        const response = await axios.post(url, {}, {
            headers: {
                'Authorization': `Bearer ${dwToken}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error("Failed to publish chart in Datawrapper:", error);
        throw error;
    }
};

/**
 * Retrieves data from a Datawrapper chart using the DW API.
 * @param {string} chartId - The ID of the Datawrapper chart to fetch data from.
 * @returns {Promise<Object>} - A promise that resolves to the chart data.
 */
export const getDataFromDwChart = async (chartId) => {
    const url = `https://api.datawrapper.de/v3/charts/${chartId}/data`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${dwToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error fetching data: ${response.statusText}`);
        }

        const data = await response.text();
        // Optionally parse CSV data if necessary
        return data;
    } catch (error) {
        console.error("Failed to fetch chart data from Datawrapper:", error);
        throw error;
    }
};

/**
 * Updates the notes section of a Datawrapper chart.
 * @param {string} chartId - The ID of the Datawrapper chart.
 * @param {string} notes - The notes content to update the chart with.
 * @returns {Promise<void>} - Resolves when the notes are updated successfully.
 */
export const updateChartNotes = async (chartId, notes) => {
    try {
        const response = await axios.patch(
            `https://api.datawrapper.de/v3/charts/${chartId}`,
            { metadata: { annotate: { notes } } },
            {
                headers: {
                    Authorization: `Bearer ${dwToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.status !== 200) {
            throw new Error(`Failed to update chart notes: ${response.statusText}`);
        }
        console.log('Chart notes updated successfully');
    } catch (error) {
        console.error('Error updating chart notes:', error.message);
    }
};


/**
 * Republishes a Datawrapper chart to make the updates publicly visible.
 * @param {string} chartId - The ID of the Datawrapper chart.
 * @returns {Promise<void>} - Resolves when the chart is republished successfully.
 */
export const republishChart = async (chartId) => {
    try {
        const response = await axios.post(
            `https://api.datawrapper.de/v3/charts/${chartId}/publish`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${dwToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.status !== 200) {
            throw new Error(`Failed to republish chart: ${response.statusText}`);
        }
        console.log('Chart republished successfully');
    } catch (error) {
        console.error('Error republishing chart:', error.message);
    }
};

/**
 * Uploads marker data to a Datawrapper chart and updates its notes and republishing status.
 * @param {Array} markersData - The marker data to upload.
 * @param {string} chartId - The ID of the Datawrapper chart.
 * @returns {Promise<void>} - Resolves when the data is uploaded and the chart is updated successfully.
 */
export const uploadMarkersToDW = async (markersData, chartId) => {
    try {
        const response = await axios.put(
            `https://api.datawrapper.de/v3/charts/${chartId}/data`,
            JSON.stringify({ markers: markersData }),
            {
                headers: {
                    Authorization: `Bearer ${dwToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.status !== 204) {
            throw new Error(`Failed to upload markers data: ${response.statusText}`);
        }
        console.log('Markers data uploaded to Datawrapper chart successfully');

        // Update chart notes
        await updateChartNotes(chartId, getTimeString());
        console.log('Notes updated successfully');

        // Republish the chart
        await republishChart(chartId);
        console.log('Chart republished successfully');
    } catch (error) {
        console.error('Error uploading markers to Datawrapper:', error.message);
    }
};



