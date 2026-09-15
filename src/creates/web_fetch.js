const {
    WEB_FETCH_STANDBY_URL,
    WEB_FETCH_FORMATS,
    WEB_FETCH_TIMEOUT_MILLIS,
    WEB_FETCH_SAMPLE,
    WEB_FETCH_OUTPUT_FIELDS,
} = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');

/**
 * Fetches a single URL using the Web Fetch Actor (https://apify.com/apify/web-fetch) running in
 * Standby mode.
 */
const webFetch = async (z, bundle) => {
    const { url, formats, headers } = bundle.inputData;

    // Zapier sends a single selected value as a string, but the Actor expects an array.
    let requestedFormats = formats || [];
    if (!Array.isArray(requestedFormats)) requestedFormats = [requestedFormats];

    const input = { url };
    if (requestedFormats.length) input.formats = requestedFormats;
    if (headers && Object.keys(headers).length) input.headers = headers;

    const requestOpts = {
        url: WEB_FETCH_STANDBY_URL,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(input),
        // Web Fetch allows a fetch to take up to 2 minutes, which is longer than a Zap can wait for.
        timeout: WEB_FETCH_TIMEOUT_MILLIS,
    };

    let response;
    try {
        response = await wrapRequestWithRetries(z.request, requestOpts);
    } catch (err) {
        // A timeout on our side surfaces as a network error without a status, so it cannot be
        // handled in the response middleware with the other Web Fetch errors.
        if (err.name === 'TimeoutError' || /timed? ?out/i.test(err.message)) {
            throw new z.errors.Error(
                `Fetching ${url} took more than ${WEB_FETCH_TIMEOUT_MILLIS / 1000} seconds. `
                    + 'The website may be slow or too large. Please try again, or use a different URL.',
                'FETCH_TIMEOUT',
                504,
            );
        }
        throw err;
    }

    return response.data;
};

module.exports = {
    key: 'webFetch',
    noun: 'Web Fetch',
    display: {
        label: 'Web Fetch',
        description: 'Fetches the content of a web page, PDF or file and returns it as markdown, HTML, plain text, links or raw content. '
            + 'It gets past bot protection and returns the content in a single step, which makes it a good fit for '
            + 'large language model (LLM) flows.',
    },
    operation: {
        inputFields: [
            {
                label: 'Note',
                key: 'note',
                type: 'copy',
                helpText: 'This action is designed to fetch the content of a single web page or file. '
                    + 'Behind the scenes, it utilizes [Web Fetch](https://apify.com/apify/web-fetch), '
                    + 'which gets past bot protection and returns the content in a single step. '
                    + 'If you need to crawl multiple URLs or a whole website, you can run '
                    + '[Website Content Crawler](https://apify.com/apify/website-content-crawler) or '
                    + '[Web Scraper](https://apify.com/apify/web-scraper), '
                    + 'both of which offer a range of options to assist you with scraping multiple URLs and many more. '
                    + 'These scrapers are available to run under "Run Actor" in Apify Zaps.',
            },
            {
                label: 'URL',
                helpText: 'The URL of a web page, PDF, image or other file to fetch. Only `http://` and `https://` URLs are supported.',
                key: 'url',
                required: true,
                type: 'string',
            },
            {
                label: 'Output formats',
                helpText: 'Which formats to return. A format that does not apply to the fetched content is returned empty, '
                    + 'for example **Links** for an image. Add **Raw**, which works for any content type, to always get a response.',
                key: 'formats',
                required: false,
                type: 'string',
                list: true,
                choices: WEB_FETCH_FORMATS,
                default: 'markdown',
            },
            {
                label: 'Custom headers',
                helpText: 'Additional HTTP headers to send to the target URL, for example `Accept-Language` for localized content '
                    + 'or a session cookie the website expects.',
                key: 'headers',
                required: false,
                dict: true,
            },
        ],

        perform: webFetch,

        sample: WEB_FETCH_SAMPLE,
        outputFields: WEB_FETCH_OUTPUT_FIELDS,
    },
};
