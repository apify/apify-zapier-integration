const {
    WEB_FETCH_STANDBY_URL,
    WEB_FETCH_FORMATS,
    WEB_FETCH_FORMAT_FIELD_PREFIX,
    WEB_FETCH_TIMEOUT_MILLIS,
    WEB_FETCH_SAMPLE,
    WEB_FETCH_OUTPUT_FIELDS,
} = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');

/**
 * Fetches a single URL using the Web Fetch Actor (https://apify.com/apify/web-fetch) running in
 * Server mode.
 */

// Zapier normally hands over a checkbox as a boolean,
// but it sends the raw value when input data cleaning is turned off, so both shapes are accepted here.
const isChecked = (value) => value === true || value === 'true' || value === 'yes';

const webFetch = async (z, bundle) => {
    const { url, headers } = bundle.inputData;

    // Each format has its own checkbox, so the Actor input is assembled from whichever are ticked.
    const requestedFormats = Object.keys(WEB_FETCH_FORMATS)
        .filter((format) => isChecked(bundle.inputData[`${WEB_FETCH_FORMAT_FIELD_PREFIX}${format}`]));

    // Zapier keeps the blank rows of a dict field, and the Actor fails the whole fetch on a header without a name.
    const validHeaders = Object.fromEntries(Object.entries(headers || {}).filter(([name]) => name.trim()));

    const input = { url };
    if (requestedFormats.length) input.formats = requestedFormats;
    if (Object.keys(validHeaders).length) input.headers = validHeaders;

    const requestOpts = {
        url: WEB_FETCH_STANDBY_URL,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(input),
        timeout: WEB_FETCH_TIMEOUT_MILLIS,
    };

    let response;
    try {
        response = await wrapRequestWithRetries(z.request, requestOpts);
    } catch (err) {
        // A timeout on our side surfaces as a node-fetch error without a status, so it cannot be
        // handled in the response middleware with the other Web Fetch errors. Match on the error
        // type rather than the message, which would also match the Actor's own FETCH_TIMEOUT code.
        if (err.type === 'request-timeout') {
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

const FORMAT_FIELD_GROUP_KEY = 'outputFormats';
const ADVANCED_FIELD_GROUP_KEY = 'advanced';

/**
 * Help text of the format checkboxes, based on the Web Fetch input schema
 * (https://apify.com/apify/web-fetch/input-schema).
 */
const FORMAT_HELP_TEXTS = {
    markdown: 'Page content as Markdown.',
    html: 'Cleaned HTML of the main article, without ads, navigation, and footers. '
        + 'If the page has no clear main article, the full page without boilerplate.',
    text: 'Plain text of the main article, or of the full page without boilerplate if there is no clear article. '
        + 'Plain-text files are returned unchanged.',
    links: 'Absolute URLs of all links on the page, deduplicated, in page order.',
    raw: 'Original HTTP response body, for any content type. Text is returned unchanged; '
        + 'binary content, such as images and PDFs, is base64-encoded.',
};

const FORMAT_INPUT_FIELDS = Object.entries(WEB_FETCH_FORMATS).map(([format, label]) => ({
    label,
    key: `${WEB_FETCH_FORMAT_FIELD_PREFIX}${format}`,
    helpText: FORMAT_HELP_TEXTS[format],
    required: false,
    type: 'boolean',
    default: format === 'markdown' ? 'yes' : 'no',
    group: FORMAT_FIELD_GROUP_KEY,
}));

module.exports = {
    key: 'webFetch',
    noun: 'Web Fetch',
    display: {
        label: 'Web Fetch',
        description: 'Fetches a web page, PDF, or other file and returns it as Markdown, HTML, plain text, links, or raw content. '
            + 'It gets past bot protection, which makes it a good fit for large language model (LLM) workflows.',
    },
    operation: {
        inputFields: [
            {
                label: 'Note',
                key: 'note',
                type: 'copy',
                helpText: 'Fetches a single web page or file using [Web Fetch](https://apify.com/apify/web-fetch). '
                    + 'To crawl many URLs or a whole website, use the **Run Actor** action with '
                    + '[Website Content Crawler](https://apify.com/apify/website-content-crawler) or '
                    + '[Web Scraper](https://apify.com/apify/web-scraper).',
            },
            {
                label: 'URL',
                helpText: 'The URL of a web page, PDF, image, or other file to fetch. Only `http://` and `https://` URLs are supported.',
                key: 'url',
                required: true,
                type: 'string',
            },
            {
                label: 'Output formats',
                key: 'outputFormatsNote',
                type: 'copy',
                helpText: 'Set any number of formats to **Yes**. If all are **No**, Web Fetch picks a format based on the content type.',
                group: FORMAT_FIELD_GROUP_KEY,
            },
            ...FORMAT_INPUT_FIELDS,
            {
                label: 'Custom headers',
                helpText: 'Additional HTTP headers to send to the target URL, for example `Accept-Language` for localized content '
                    + 'or a session cookie the website expects.',
                key: 'headers',
                required: false,
                dict: true,
                group: ADVANCED_FIELD_GROUP_KEY,
            },
        ],

        /**
         * Zapier renders the ungrouped fields first and the groups in this order, so the formats end
         * up under the URL. The note and the URL are left ungrouped on purpose, a group would only
         * wrap each of them in a header of its own.
         */
        inputFieldGroups: [
            {
                key: FORMAT_FIELD_GROUP_KEY,
                label: 'Output formats',
                emphasize: true,
            },
            {
                key: ADVANCED_FIELD_GROUP_KEY,
                label: 'Advanced',
                emphasize: false,
            },
        ],

        perform: webFetch,

        sample: WEB_FETCH_SAMPLE,
        outputFields: WEB_FETCH_OUTPUT_FIELDS,
    },
};
