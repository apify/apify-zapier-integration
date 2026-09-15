const {
    KEY_VALUE_STORE_KEYS,
    ACTOR_LIMITS: { MIN_RUN_MEMORY_MBYTES, MAX_RUN_MEMORY_MBYTES },
    ACTOR_JOB_STATUSES,
    WEBHOOK_EVENT_TYPES,
} = require('@apify/consts');

/**
 *  NOTE: We don't use ApifyClient from apify-client-js package in integration. Because if we use it,
 * we can not use z.request function and we lost logging and other function specific for
 * Zapier platform.
 */
const APIFY_API_BASE_URL = 'https://api.apify.com';

/**
 * Apify API URL endpoints, which we will use in integration.
 */
const APIFY_API_ENDPOINTS = {
    actorRuns: `${APIFY_API_BASE_URL}/v2/actor-runs`,
    actors: `${APIFY_API_BASE_URL}/v2/acts`,
    datasets: `${APIFY_API_BASE_URL}/v2/datasets`,
    keyValueStores: `${APIFY_API_BASE_URL}/v2/key-value-stores`,
    store: `${APIFY_API_BASE_URL}/v2/store`,
    tasks: `${APIFY_API_BASE_URL}/v2/actor-tasks`,
    users: `${APIFY_API_BASE_URL}/v2/users`,
    webhooks: `${APIFY_API_BASE_URL}/v2/webhooks`,
};

/**
 * The Web Fetch Actor (apify/web-fetch) runs in Standby mode, i.e. it exposes a real-time HTTP
 * endpoint on its own host instead of the Apify API. A single request returns the page content,
 * so there is no run to poll and no dataset to read.
 */
const WEB_FETCH_STANDBY_URL = 'https://web-fetch.apify.actor';
const WEB_FETCH_STANDBY_HOST = new URL(WEB_FETCH_STANDBY_URL).host;

/**
 * Output formats supported by the Web Fetch Actor. A format that does not apply to the fetched
 * content type comes back as null, which is not an error, e.g. links for a PDF.
 */
const WEB_FETCH_FORMATS = {
    markdown: 'Markdown',
    html: 'HTML',
    text: 'Plain text',
    links: 'Links',
    raw: 'Raw',
};

/**
 * Web Fetch allows up to 2 minutes per fetch, but a Zapier perform has a much shorter budget,
 * so we cut the request off ourselves to be able to return a meaningful error instead of letting
 * Zapier kill the whole task with an opaque timeout.
 */
const WEB_FETCH_TIMEOUT_MILLIS = 25000;

const ACTOR_RUN_SAMPLE = {
    id: 'HG7ML7M8z78YcAPEB',
    actId: 'h3J7Uk3kMAmLCLRAh',
    buildId: '7ML7M8zcAPEB78Y',
    buildNumber: '0.1.15',
    startedAt: '2015-11-30T07:34:24.202Z',
    finishedAt: '2015-12-12T09:30:12.202Z',
    status: 'SUCCEEDED',
    exitCode: 0,
    defaultKeyValueStoreId: 'sfAjeR4QmeJCQzTfe',
    defaultDatasetId: '3ZojQDdFTsyE7Moy4',
    defaultRequestQueueId: 'so93g2shcDzK3pA85',
    platformUsageBillingModel: 'USER',
    OUTPUT: {},
    datasetItems: [],
    integrationTracking: { platform: 'zapier', appId: null },
    datasetItemsFileUrls: {
        xml: 'https://api.apify.com/v2/datasets/3ZojQDdFTsyE7Moy4/items?format=xml&clean=true&attachment=true',
        csv: 'https://api.apify.com/v2/datasets/3ZojQDdFTsyE7Moy4/items?format=csv&clean=true&attachment=true',
        json: 'https://api.apify.com/v2/datasets/3ZojQDdFTsyE7Moy4/items?format=json&clean=true&attachment=true',
        xlsx: 'https://api.apify.com/v2/datasets/3ZojQDdFTsyE7Moy4/items?format=xlsx&clean=true&attachment=true',
    },
    generalAccess: {},
    storageIds: {
        keyValueStoreId: 'sfAjeR4QmeJCQzTfe',
        datasetId: '3ZojQDdFTsyE7Moy4',
        requestQueueId: 'so93g2shcDzK3pA85',
    },
    containerUrl: 'https://rsklyfvj7pxp.runs.apify.net',
    detailsPageUrl: 'https://console.apify.com/actors/h3J7Uk3kMAmLCLRAh/runs/HG7ML7M8z78YcAPEB',
    usage: {
        ACTOR_COMPUTE_UNITS: 0.0005676388888888888,
        DATASET_READS: 0,
        DATASET_WRITES: 0,
        KEY_VALUE_STORE_READS: 2,
        KEY_VALUE_STORE_WRITES: 2,
        KEY_VALUE_STORE_LISTS: 0,
        REQUEST_QUEUE_READS: 0,
        REQUEST_QUEUE_WRITES: 0,
        DATA_TRANSFER_INTERNAL_GBYTES: 0.0014107311144471169,
        DATA_TRANSFER_EXTERNAL_GBYTES: 0,
        PROXY_RESIDENTIAL_TRANSFER_GBYTES: 0,
        PROXY_SERPS: 0,
    },
    usageTotalUsd: 0.0004075921112779114,
    usageUsd: {
        ACTOR_COMPUTE_UNITS: 0.00022705555555555554,
        DATASET_READS: 0,
        DATASET_WRITES: 0,
        KEY_VALUE_STORE_READS: 0.00001,
        KEY_VALUE_STORE_WRITES: 0.0001,
        KEY_VALUE_STORE_LISTS: 0,
        REQUEST_QUEUE_READS: 0,
        REQUEST_QUEUE_WRITES: 0,
        DATA_TRANSFER_INTERNAL_GBYTES: 0.00007053655572235585,
        DATA_TRANSFER_EXTERNAL_GBYTES: 0,
        PROXY_RESIDENTIAL_TRANSFER_GBYTES: 0,
        PROXY_SERPS: 0,
    },
};

const ACTOR_RUN_SAMPLE_SYNC = {
    ...ACTOR_RUN_SAMPLE,
    consoleUrl: 'https://console.apify.com/view/runs/tbplDsWxC8dabcsRb',
};

const SCRAPE_SINGLE_URL_RUN_SAMPLE = {
    id: 'HG7ML7M8z78YcAPEB',
    actId: 'h3J7Uk3kMAmLCLRAh',
    buildId: '7ML7M8zcAPEB78Y',
    buildNumber: '0.1.15',
    startedAt: '2015-11-30T07:34:24.202Z',
    finishedAt: '2015-12-12T09:30:12.202Z',
    status: 'SUCCEEDED',
    exitCode: 0,
    defaultKeyValueStoreId: 'sfAjeR4QmeJCQzTfe',
    defaultDatasetId: '3ZojQDdFTsyE7Moy4',
    defaultRequestQueueId: 'so93g2shcDzK3pA85',
    containerUrl: 'https://rsklyfvj7pxp.runs.apify.net',
    detailsPageUrl: 'https://console.apify.com/actors/h3J7Uk3kMAmLCLRAh/runs/HG7ML7M8z78YcAPEB',
    isStatusMessageTerminal: true,
    statusMessage: 'Actor finished!',
    platformUsageBillingModel: 'USER',
    integrationTracking: { platform: 'zapier', appId: null },
    generalAccess: {},
    storageIds: {
        keyValueStoreId: 'sfAjeR4QmeJCQzTfe',
        datasetId: '3ZojQDdFTsyE7Moy4',
        requestQueueId: 'so93g2shcDzK3pA85',
    },
    usage: {
        ACTOR_COMPUTE_UNITS: 0.0005676388888888888,
        DATASET_READS: 0,
        DATASET_WRITES: 0,
        KEY_VALUE_STORE_READS: 2,
        KEY_VALUE_STORE_WRITES: 2,
        KEY_VALUE_STORE_LISTS: 0,
        REQUEST_QUEUE_READS: 0,
        REQUEST_QUEUE_WRITES: 0,
        DATA_TRANSFER_INTERNAL_GBYTES: 0.0014107311144471169,
        DATA_TRANSFER_EXTERNAL_GBYTES: 0,
        PROXY_RESIDENTIAL_TRANSFER_GBYTES: 0,
        PROXY_SERPS: 0,
    },
    usageTotalUsd: 0.0004075921112779114,
    usageUsd: {
        ACTOR_COMPUTE_UNITS: 0.00022705555555555554,
        DATASET_READS: 0,
        DATASET_WRITES: 0,
        KEY_VALUE_STORE_READS: 0.00001,
        KEY_VALUE_STORE_WRITES: 0.0001,
        KEY_VALUE_STORE_LISTS: 0,
        REQUEST_QUEUE_READS: 0,
        REQUEST_QUEUE_WRITES: 0,
        DATA_TRANSFER_INTERNAL_GBYTES: 0.00007053655572235585,
        DATA_TRANSFER_EXTERNAL_GBYTES: 0,
        PROXY_RESIDENTIAL_TRANSFER_GBYTES: 0,
        PROXY_SERPS: 0,
    },
    pageUrl: 'https://www.example.com',
    pageMetadata: {
        canonicalUrl: 'https://example.com/',
        title: 'Example Domain',
        description: null,
        author: null,
        keywords: null,
        languageCode: null,
    },
    pageContent: {
        html: '<div id="readability-page-1" class="page"><div>\n    <h2>Example Domain</h2>\n    '
            + '<p>This domain is for use in illustrative examples in documents. You may use this\n    '
            + 'domain in literature without prior coordination or asking for permission.</p>\n    '
            + '<p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div></div>',
        markdown: '"## Example Domain\\n\\nThis domain is for use in illustrative examples in documents. '
            + 'You may use this domain in literature without prior coordination or asking for permission.\\n\\n'
            + '[More information...](https://www.iana.org/domains/example)"',
        text: 'Example Domain\nThis domain is for use in illustrative examples in documents. '
            + 'You may use this domain in literature without prior coordination or asking for permission.\nMore information...',
    },
};

const ACTOR_RUN_OUTPUT_FIELDS = [
    { key: 'id', label: 'ID', type: 'string' },
    { key: 'actId', label: 'Actor ID', type: 'string' },
    { key: 'buildId', label: 'Build ID', type: 'string' },
    { key: 'buildNumber', label: 'Build number', type: 'string' },
    { key: 'startedAt', label: 'Started at' },
    { key: 'finishedAt', label: 'Finished at' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'exitCode', label: 'Exit Code', type: 'number' },
    { key: 'defaultKeyValueStoreId', label: 'Default key-value store ID', type: 'string' },
    { key: 'defaultDatasetId', label: 'Default dataset ID', type: 'string' },
    { key: 'defaultRequestQueueId', label: 'Default request queue ID', type: 'string' },
    { key: 'OUTPUT', label: 'Output' },
    { key: 'detailsPageUrl', label: 'Details page URL', type: 'string' },
    { key: 'containerUrl', label: 'Container URL', type: 'string' },
    { key: 'datasetItemsFileUrls__xml', label: 'Dataset items XML file URL', type: 'string' },
    { key: 'datasetItemsFileUrls__csv', label: 'Dataset items CSV file URL', type: 'string' },
    { key: 'datasetItemsFileUrls__json', label: 'Dataset items JSON file URL', type: 'string' },
    { key: 'datasetItemsFileUrls__xlsx', label: 'Dataset items Excel file URL', type: 'string' },
];

const SCRAPE_SINGLE_URL_RUN_OUTPUT_FIELDS = [
    { key: 'id', label: 'ID', type: 'string' },
    { key: 'actId', label: 'Actor ID', type: 'string' },
    { key: 'buildId', label: 'Build ID', type: 'string' },
    { key: 'buildNumber', label: 'Build number', type: 'string' },
    { key: 'startedAt', label: 'Started at' },
    { key: 'finishedAt', label: 'Finished at' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'exitCode', label: 'Exit Code', type: 'number' },
    { key: 'defaultKeyValueStoreId', label: 'Default key-value store ID', type: 'string' },
    { key: 'defaultDatasetId', label: 'Default dataset ID', type: 'string' },
    { key: 'defaultRequestQueueId', label: 'Default request queue ID', type: 'string' },
    { key: 'detailsPageUrl', label: 'Details page URL', type: 'string' },
    { key: 'containerUrl', label: 'Container URL', type: 'string' },
    { key: 'pageUrl', label: 'Page URL', type: 'string' },
    { key: 'pageMetadata', label: 'Page metadata' },
    { key: 'pageMetadata__title', label: 'Page title' },
    { key: 'pageContent', label: 'Page content' },
    { key: 'pageContent__html', label: 'Page HTML', type: 'string' },
    { key: 'pageContent__markdown', label: 'Page markdown', type: 'string' },
    { key: 'pageContent__text', label: 'Page text', type: 'string' },
];

/**
 * A Web Fetch response envelope. Beside `url`, `fetch` and `metadata`, which are always present,
 * the response carries one key per requested format, hence all of them are listed in the sample.
 */
const WEB_FETCH_SAMPLE = {
    url: 'https://www.example.com',
    fetch: {
        loadedUrl: 'https://www.example.com/',
        loadedTime: '2026-07-27T12:41:41.064Z',
        httpStatusCode: 200,
        contentLengthBytes: 1256,
        contentType: 'text/html; charset=utf-8',
    },
    metadata: {
        canonicalUrl: 'https://www.example.com/',
        title: 'Example Domain',
        description: null,
        author: null,
        keywords: null,
        languageCode: 'en',
        openGraph: [
            { property: 'og:title', content: 'Example Domain' },
        ],
        jsonLd: null,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-length': '1256',
        },
    },
    markdown: '## Example Domain\n\nThis domain is for use in illustrative examples in documents. '
        + 'You may use this domain in literature without prior coordination or asking for permission.\n\n'
        + '[More information...](https://www.iana.org/domains/example)',
    html: '<div><h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents.</p></div>',
    text: 'Example Domain\nThis domain is for use in illustrative examples in documents. '
        + 'You may use this domain in literature without prior coordination or asking for permission.\nMore information...',
    links: ['https://www.iana.org/domains/example'],
    raw: '<!doctype html><html><head><title>Example Domain</title></head><body></body></html>',
};

const WEB_FETCH_OUTPUT_FIELDS = [
    { key: 'url', label: 'URL', type: 'string' },
    { key: 'fetch__loadedUrl', label: 'Loaded URL', type: 'string' },
    { key: 'fetch__loadedTime', label: 'Loaded at' },
    { key: 'fetch__httpStatusCode', label: 'HTTP status code', type: 'integer' },
    { key: 'fetch__contentLengthBytes', label: 'Content length in bytes', type: 'integer' },
    { key: 'fetch__contentType', label: 'Content type', type: 'string' },
    { key: 'metadata__title', label: 'Page title', type: 'string' },
    { key: 'metadata__description', label: 'Page description', type: 'string' },
    { key: 'metadata__canonicalUrl', label: 'Canonical URL', type: 'string' },
    { key: 'metadata__author', label: 'Author', type: 'string' },
    { key: 'metadata__keywords', label: 'Keywords', type: 'string' },
    { key: 'metadata__languageCode', label: 'Language code', type: 'string' },
    { key: 'markdown', label: 'Markdown', type: 'string' },
    { key: 'html', label: 'HTML', type: 'string' },
    { key: 'text', label: 'Plain text', type: 'string' },
    { key: 'links', label: 'Links' },
    { key: 'raw', label: 'Raw', type: 'string' },
];

const TASK_RUN_SAMPLE = {
    ...ACTOR_RUN_SAMPLE,
    actorTaskId: 'UJNG9zau8PEB7U',
    detailsPageUrl: 'https://console.apify.com/actors/tasks/UJNG9zau8PEB7U/runs/HG7ML7M8z78YcAPEB',
    consoleUrl: 'https://console.apify.com/view/runs/tbplDsWxC8dabcsRb',
};

const TASK_RUN_OUTPUT_FIELDS = ACTOR_RUN_OUTPUT_FIELDS.concat([{ key: 'actorTaskId', label: 'Actor task ID', type: 'string' }]);

const DATASET_SAMPLE = {
    id: 'fYYRaBM5FSoCZ2Tf9',
    name: 'dataset-sample',
    createdAt: '2019-05-23T14:00:09.234Z',
    modifiedAt: '2019-05-23T14:21:37.312Z',
    itemCount: 1,
    cleanItemCount: 1,
    actId: 'moJRLRc85AitArpUL',
    actRunId: '8yOSRtmH3iSnPcG3b',
    items: [],
    itemsFileUrls: {
        xml: 'https://api.apify.com/v2/datasets/fYYRaBM5FSoCZ2Tf9/items?format=xml&clean=true&attachment=true',
        csv: 'https://api.apify.com/v2/datasets/fYYRaBM5FSoCZ2Tf9/items?format=csv&clean=true&attachment=true',
        json: 'https://api.apify.com/v2/datasets/fYYRaBM5FSoCZ2Tf9/items?format=json&clean=true&attachment=true',
        xlsx: 'https://api.apify.com/v2/datasets/fYYRaBM5FSoCZ2Tf9/items?format=xlsx&clean=true&attachment=true',
    },
};

const DATASET_OUTPUT_FIELDS = [
    { key: 'id', label: 'ID', type: 'string' },
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'createdAt', label: 'Created at' },
    { key: 'modifiedAt', label: 'Modified at' },
    { key: 'itemCount', label: 'Item count', type: 'integer' },
    { key: 'cleanItemCount', label: 'Clean item count', type: 'integer' },
    { key: 'actId', label: 'Actor ID', type: 'string' },
    { key: 'actRunId', label: 'Actor run ID', type: 'string' },
    { key: 'itemsFileUrls__xml', label: 'Items XML file URL', type: 'string' },
    { key: 'itemsFileUrls__csv', label: 'Items CSV file URL', type: 'string' },
    { key: 'itemsFileUrls__json', label: 'Items JSON file URL', type: 'string' },
    { key: 'itemsFileUrls__xlsx', label: 'Items Excel file URL', type: 'string' },
];

/**
 * Example output fields for set key-value store action.
 */
const KEY_VALUE_STORE_SAMPLE = {
    keyValueStore: {
        id: '98e7lEimuGBDvFfcM',
        name: 'my-store',
        userId: 'GWnltczwPrB3uTMal',
        createdAt: '2019-04-24T09:50:49.930Z',
        modifiedAt: '2019-05-31T11:56:34.472Z',
        accessedAt: '2019-05-31T11:56:33.300Z',
    },
    keyValueStoreRecordUrl: 'https://api.apify.com/v2/key-value-stores/56e7hEimwGKOvFfcM/records/my-record',
};

const DEFAULT_KEY_VALUE_STORE_KEYS = [KEY_VALUE_STORE_KEYS.OUTPUT];

// NOTE: The pagination is searchable in the UI, so it's better to return more items to be able to search.
const DEFAULT_PAGINATION_LIMIT = 500;

// Actor ID of apify/legacy-phantomjs-crawler
const LEGACY_PHANTOM_JS_CRAWLER_ID = 'YPh5JENjSSR6vBf2E';

// Field to omit from actor run, these are useless in Zapier
const OMIT_ACTOR_RUN_FIELDS = ['meta', 'stats', 'options', 'userId', 'output', 'standby'];

// Field to pick from dataset detail
const DATASET_PUBLISH_FIELDS = ['id', 'name', 'createdAt', 'modifiedAt', 'itemCount', 'cleanItemCount', 'actId', 'actRunId'];

const FETCH_DATASET_ITEMS_ITEMS_LIMIT = 100;
// Maximum estimated response size for inline dataset item fetching in triggers. Larger datasets must be downloaded via file URLs.
const DATASET_ITEMS_INLINE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DATASET_MAX_SIZE_MARGIN = 1.2; // 20% safety margin for the dataset size

// List of allowed memory for actor run 128, 256, 512 ..
const ALLOWED_MEMORY_MBYTES_LIST = Array.from(
    Array(Math.log2(MAX_RUN_MEMORY_MBYTES / MIN_RUN_MEMORY_MBYTES) + 1),
    (x, i) => MIN_RUN_MEMORY_MBYTES * (2 ** i),
);

const DEFAULT_RUN_WAIT_TIME_OUT_SECONDS = 360;

const DEFAULT_ACTOR_MEMORY_MBYTES = 2048;

const ACTOR_RUN_TERMINAL_STATUSES = {
    [ACTOR_JOB_STATUSES.SUCCEEDED]: 'Succeeded',
    [ACTOR_JOB_STATUSES.FAILED]: 'Failed',
    [ACTOR_JOB_STATUSES.TIMED_OUT]: 'Timed Out',
    [ACTOR_JOB_STATUSES.ABORTED]: 'Aborted',
};

const ACTOR_RUN_TERMINAL_EVENT_TYPES = {
    [ACTOR_JOB_STATUSES.SUCCEEDED]: WEBHOOK_EVENT_TYPES.ACTOR_RUN_SUCCEEDED,
    [ACTOR_JOB_STATUSES.FAILED]: WEBHOOK_EVENT_TYPES.ACTOR_RUN_FAILED,
    [ACTOR_JOB_STATUSES.TIMED_OUT]: WEBHOOK_EVENT_TYPES.ACTOR_RUN_TIMED_OUT,
    [ACTOR_JOB_STATUSES.ABORTED]: WEBHOOK_EVENT_TYPES.ACTOR_RUN_ABORTED,
};

const ACTOR_RUN_STATUSES = {
    ...ACTOR_RUN_TERMINAL_STATUSES,
    [ACTOR_JOB_STATUSES.READY]: 'Ready',
    [ACTOR_JOB_STATUSES.RUNNING]: 'Running',
    [ACTOR_JOB_STATUSES.TIMING_OUT]: 'Timing out',
    [ACTOR_JOB_STATUSES.ABORTING]: 'Aborting',
};

const RECENTLY_USED_ACTORS_KEY = 'RECENTLY_USED_ACTORS';
const STORE_ACTORS_KEY = 'STORE_ACTORS';

const ACTOR_SEARCH_SOURCES = {
    [RECENTLY_USED_ACTORS_KEY]: 'Recently used Actors',
    [STORE_ACTORS_KEY]: 'Apify Store Actors',
};

module.exports = {
    APIFY_API_ENDPOINTS,
    ACTOR_RUN_SAMPLE,
    ACTOR_RUN_SAMPLE_SYNC,
    ACTOR_RUN_OUTPUT_FIELDS,
    TASK_RUN_SAMPLE,
    TASK_RUN_OUTPUT_FIELDS,
    DEFAULT_KEY_VALUE_STORE_KEYS,
    DEFAULT_PAGINATION_LIMIT,
    LEGACY_PHANTOM_JS_CRAWLER_ID,
    OMIT_ACTOR_RUN_FIELDS,
    DATASET_PUBLISH_FIELDS,
    FETCH_DATASET_ITEMS_ITEMS_LIMIT,
    DATASET_ITEMS_INLINE_MAX_BYTES,
    DATASET_MAX_SIZE_MARGIN,
    ALLOWED_MEMORY_MBYTES_LIST,
    DEFAULT_RUN_WAIT_TIME_OUT_SECONDS,
    DEFAULT_ACTOR_MEMORY_MBYTES,
    DATASET_SAMPLE,
    DATASET_OUTPUT_FIELDS,
    KEY_VALUE_STORE_SAMPLE,
    SCRAPE_SINGLE_URL_RUN_SAMPLE,
    SCRAPE_SINGLE_URL_RUN_OUTPUT_FIELDS,
    WEB_FETCH_STANDBY_URL,
    WEB_FETCH_STANDBY_HOST,
    WEB_FETCH_FORMATS,
    WEB_FETCH_TIMEOUT_MILLIS,
    WEB_FETCH_SAMPLE,
    WEB_FETCH_OUTPUT_FIELDS,
    ACTOR_RUN_TERMINAL_STATUSES,
    ACTOR_RUN_TERMINAL_EVENT_TYPES,
    ACTOR_RUN_STATUSES,
    RECENTLY_USED_ACTORS_KEY,
    STORE_ACTORS_KEY,
    ACTOR_SEARCH_SOURCES,
};
