import { Octokit } from "@octokit/core";
import dotenv from 'dotenv';

dotenv.config();

// Ensure you have your GitHub token stored in your .env file
const GIST_UPDATE_TOKEN = process.env.GIST_UPDATE_TOKEN;

if (!GIST_UPDATE_TOKEN) {
    console.error('GitHub token is missing. Please set GIST_UPDATE_TOKEN in your .env file.');
    process.exit(1);
}

const octokit = new Octokit({
    auth: GIST_UPDATE_TOKEN,
});

/**
 * Function to create a public Gist
 * @param {string} description - Description of the Gist
 * @param {string} fileName - Name of the file in the Gist
 * @param {string} content - Content of the file
 * @returns {Promise<string>} - The ID of the created Gist
 */
export async function createGist(description, fileName, content) {
    try {
        const response = await octokit.request('POST /gists', {
            description: description,
            public: true,
            files: {
                [fileName]: {
                    content: content
                }
            }
        });

        const gistId = response.data.id;
        console.log(`Gist ID: ${gistId}`);
        console.log(`https://gist.github.com/iguacel/${gistId}`)
        return gistId;
    } catch (error) {
        console.error('Failed to create Gist:', error.response ? error.response.data : error.message);
        throw error;
    }
}

/**
 * Updates a Gist with the provided content.
 *
 * @param {string} gistId - The ID of the Gist to update.
 * @param {string} fileName - The name of the file within the Gist to update.
 * @param {object} newContent - The new content to update the file with.
 * @returns {Promise<void>}
 */
export async function updateGistContent(gistId, fileName, newContent) {
    try {
        const response = await octokit.request("PATCH /gists/{gist_id}", {
            gist_id: gistId,
            files: {
                [fileName]: {
                    content: newContent,
                },
            },
            headers: {
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });
        console.log("Gist updated successfully:");
        console.log(`URL: ${response.data.html_url}`);
    } catch (error) {
        if (error.response) {
            console.error("Error updating gist:", error.response.data);
        } else {
            console.error("Unexpected error:", error.message);
        }
        throw error; // Re-throw the error for the calling function to handle
    }
}
