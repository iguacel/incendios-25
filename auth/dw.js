import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.ALPHA_VANTAGE_API; // https://www.alphavantage.co/
const FAANG = [ 'NVDA'];
const CHART_ID = '2bB1Y'; // Chart you want to update
const DW_TOKEN = process.env.DW_TOKEN; // Datawrapper API token

async function main() {
    /* Function that loads CSV stock data from external data source */
    const stocks = await getStockData();

    if (!stocks) {
        console.log(`[${CHART_ID}] No data available. Update aborted.`);
        return;
    }

    console.log(`[${CHART_ID}] Fetched new data.`);

    const dataResponse = await request(
        `https://api.datawrapper.de/v3/charts/${CHART_ID}/data`,
        {
            method: 'put',
            data: stocks,
        }
    );

    console.log(`[${CHART_ID}] Data updated.`);

    /* Update chart note with current date to reflect the change */
    const chartResponse = await request(
        `https://api.datawrapper.de/v3/charts/${CHART_ID}`,
        {
            method: 'patch',
            data: {
                metadata: {
                    annotate: {
                        notes: `Last update: ${new Date().toLocaleString()}`,
                    },
                },
            },
        }
    );

    console.log(`[${CHART_ID}] Last update time updated.`);

    /* Republish the chart to make the new data available */
    const publishResponse = await request(
        `https://api.datawrapper.de/v3/charts/${CHART_ID}/publish`,
        {
            method: 'post',
        }
    );

    console.log(`[${CHART_ID}] Chart published.\n\nhttps:${publishResponse.data.publicUrl}`);
}

main();

function api(stock) {
    return axios.get('https://www.alphavantage.co/query', {
        params: {
            apikey: API_KEY,
            function: 'TIME_SERIES_DAILY',
            symbol: stock,
            interval: '1min',
            datatype: 'json',
        },
    });
}

async function getStockData() {
    try {
        const responses = await Promise.all(FAANG.map((stock) => api(stock)));
        let data = responses.map((res, i) => {
            if (!res.data || !res.data['Time Series (1min)']) {
                console.error(`Error: No data for ${FAANG[i]}. Response:`, res.data);
                return null;
            }
            return Object.entries(res.data['Time Series (1min)']).map((e) => ({
                date: e[0],
                val: e[1]['4. close'],
                stock: FAANG[i],
            }));
        });

        data = data.filter(Boolean); // Remove any null entries

        if (data.length === 0) {
            return null;
        }

        const dates = data[0].map((d) => d.date);

        data = data.map((d) =>
            d.reduce((coll, s) => {
                coll[s.date] = s;
                return coll;
            }, {})
        );

        const formattedData = dates.reduce(
            (coll, date) => {
                coll.push(
                    [date, ...data.map((d) => (d[date] ? d[date].val : undefined))].join('|')
                );

                return coll;
            },
            [['Date', FAANG.join('|')].join('|')]
        );

        return formattedData.join('\n');
    } catch (error) {
        console.error('Error fetching stock data:', error);
        return null;
    }
}

function request(url, options) {
    return axios({
        url,
        headers: {
            Authorization: `Bearer ${DW_TOKEN}`,
        },
        ...options,
    });
}
