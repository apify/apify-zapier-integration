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
 * Standby mode.
 */
/**
 * Zapier normally hands over a checkbox as a boolean, but it sends the raw value when input data
 * cleaning is turned off, so both shapes are accepted here.
 */
const isChecked = (value) => value === true || value === 'true' || value === 'yes';

const webFetch = async (z, bundle) => {
    const { url, headers } = bundle.inputData;

    // Each format has its own checkbox, so the Actor input is assembled from whichever are ticked.
    const requestedFormats = Object.keys(WEB_FETCH_FORMATS)
        .filter((format) => isChecked(bundle.inputData[`${WEB_FETCH_FORMAT_FIELD_PREFIX}${format}`]));

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
    markdown: 'Page content converted to clean Markdown.',
    html: 'Cleaned HTML: the main article, with ads, navigation and footers stripped, when the page reads as one, '
        + 'or the full page with fixed boilerplate removed otherwise.',
    text: 'Page content as plain text, narrowed to the main article when the page reads as one, or the full page with '
        + 'boilerplate stripped otherwise. Content that is already text is returned verbatim.',
    links: 'Absolute URLs of the links found on the page, deduplicated and in document order.',
    raw: 'Original HTTP response body, available for any content type. Textual content is returned as it is, '
        + 'binary content such as an image or a PDF is base64-encoded.',
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
                key: 'outputFormatsNote',
                type: 'copy',
                helpText: 'Switch any number of formats to **Yes**.'
                    + 'Leave all of them on **No** to let Web Fetch choose a format based on the content type.',
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
