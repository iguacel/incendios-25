import { authenticate, replaceSheetData } from '../utils/utils.js';

const spreadsheetId = '12JiOL7KOKFUtjF-BqprNguz5gt0YV8DwT31FaZ8Moss';
const sheetName = 'Auth Test';

(async () => {
    try {
        const authClient = await authenticate();
        // Use authClient to interact with Google APIs

        const currentDate = new Date();
        const datePart = currentDate.toISOString().split('T')[0];
        const timePart = currentDate.toISOString().split('T')[1].split('.')[0];

        // Prepare the data with "Hello, World!", the date, and the time in the same row
        const data = [
            ['Hello, World!', datePart, timePart]
        ];

        await replaceSheetData(authClient, spreadsheetId, sheetName, data);
    } catch (error) {
        console.error('Error during authentication or updating data:', error);
    }
})();
