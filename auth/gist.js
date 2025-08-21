import { createGist, updateGistContent } from '../utils/gists.js';

(async () => {
    try {
        // Create a new Gist
     
        // await createGist(
        //     // description
        //     "ds-template new gist",
        //     // fileName
        //     "data.json",
        //     // content
        //     JSON.stringify({ name: "iguacel", age: null, city: "Paris" }, null, 2)
        // );

        // Update the content of the Gist
        await updateGistContent(
            // Gist ID
            "76a3c8db4c0bf193958c9b5e0d4f534a",
            // filename
            "data.json",
            // new content
            JSON.stringify({ name: "iguacel", city: "Madrid", time: new Date() }, null, 2)
        );

    } catch (error) {
        console.error('An error occurred during the process:', error);
    }
})();