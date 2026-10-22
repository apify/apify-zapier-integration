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

// An option that defaults to Yes has to stay on in Zaps created before it existed, where the value is missing.
const isUnchecked = (value) => value === false || value === 'false' || value === 'no';

// Zapier joins a mapped line-item field with commas, so several URLs arrive as one string.
const MULTIPLE_URLS_REGEX = /[\s,]+https?:\/\//i;

// Added by the Apify unblocking proxy, it says nothing about the target website.
const INTERNAL_RESPONSE_HEADERS = ['x-apify-unblocker-route'];

/**
 * Rejects input that is not one http(s) URL, before it is sent to the Actor. Web Fetch would otherwise
 * fetch e.g. the first of several comma-separated URLs with the rest as its path, and return a 404 page.
 */
const validateUrl = (z, rawUrl) => {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';

    if (MULTIPLE_URLS_REGEX.test(url)) {
        throw new z.errors.Error(
            'Web Fetch accepts one URL, but the URL field contains several. '
                + 'To fetch each of them, use Looping by Zapier and map a single URL into this field.',
            'INVALID_URL',
            400,
        );
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch (err) {
        // Handled below together with unsupported schemes.
    }

    if (!parsedUrl || !['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new z.errors.Error(
            `"${url}" is not a valid URL. Enter one full URL starting with http:// or https://, e.g. https://www.example.com.`,
            'INVALID_URL',
            400,
        );
    }

    return url;
};

/**
 * Shapes the Actor response for Zapier. Zapier flattens nested objects into one output field per key,
 * which turns JSON-LD into dozens of "Metadata Json Ld Graph ..." fields, so it is passed as one JSON string.
 */
const formatOutput = (data) => {
    const { metadata } = data || {};
    if (!metadata) return data;

    const output = { ...data, metadata: { ...metadata } };

    if (metadata.headers) {
        output.metadata.headers = Object.fromEntries(Object.entries(metadata.headers)
            .filter(([name]) => !INTERNAL_RESPONSE_HEADERS.includes(name.toLowerCase())));
    }

    if (metadata.jsonLd != null && typeof metadata.jsonLd !== 'string') {
        output.metadata.jsonLd = JSON.stringify(metadata.jsonLd);
    }

    return output;
};

const webFetch = async (z, bundle) => {
    const { headers, failOnErrorStatus } = bundle.inputData;
    const url = validateUrl(z, bundle.inputData.url);

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

    const output = formatOutput(response.data);

    // Web Fetch returns the target's error page with its status, e.g. a 404 "Document not found", and
    // passing it on would feed that page to the next steps as if it were the content.
    const statusCode = output?.fetch?.httpStatusCode;
    if (!isUnchecked(failOnErrorStatus) && Number.isInteger(statusCode) && (statusCode < 200 || statusCode >= 300)) {
        const title = output.metadata?.title ? ` (page title: "${output.metadata.title}")` : '';
        throw new z.errors.Error(
            `${url} responded with HTTP status ${statusCode}${title}. `
                + 'Check that the URL is correct, or set "Fail on error status" to No to return the response anyway.',
            'ERROR_STATUS',
            statusCode,
        );
    }

    return output;
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
                helpText: 'Switch any number of formats to **Yes**. '
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
            {
                label: 'Fail on error status',
                helpText: 'If **Yes**, the step fails when the website responds with an error status, e.g. 404 Not Found or '
                    + '500 Internal Server Error. Set to **No** to return the response, e.g. the error page, and its status instead.',
                key: 'failOnErrorStatus',
                required: false,
                type: 'boolean',
                default: 'yes',
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
