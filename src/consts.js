const {
    KEY_VALUE_STORE_KEYS,
    ACTOR_LIMITS: { MIN_RUN_MEMORY_MBYTES, MAX_RUN_MEMORY_MBYTES },
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
    users: `${APIFY_API_BASE_URL}/v2/users`,
    webhooks: `${APIFY_API_BASE_URL}/v2/webhooks`,
    tasks: `${APIFY_API_BASE_URL}/v2/actor-tasks`,
    datasets: `${APIFY_API_BASE_URL}/v2/datasets`,
    keyValueStores: `${APIFY_API_BASE_URL}/v2/key-value-stores`,
    actors: `${APIFY_API_BASE_URL}/v2/acts`,
};

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
    OUTPUT: {},
    datasetItems: [],
    datasetItemsFileUrls: {
        xml: 'https://api.apify.com/v2/datasets/3ZojQDdFTsyE7Moy4/items?format=xml&clean=true&attachment=true',
        csv: 'https://api.apify.com/v2/datasets/3ZojQDdFTsyE7Moy4/items?format=csv&clean=true&attachment=true',
        json: 'https://api.apify.com/v2/datasets/3ZojQDdFTsyE7Moy4/items?format=json&clean=true&attachment=true',
        xlsx: 'https://api.apify.com/v2/datasets/3ZojQDdFTsyE7Moy4/items?format=xlsx&clean=true&attachment=true',
    },
    containerUrl: 'https://rsklyfvj7pxp.runs.apify.net',
    detailsPageUrl: 'https://my.apify.com/actors/$actId#/runs/HG7ML7M8z78YcAPEB',
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
    { key: 'datasetItems', label: 'Dataset items' },
    { key: 'datasetItemsFileUrls', label: 'Dataset items file URLs', type: 'string' },
    { key: 'detailsPageUrl', label: 'Details page URL', type: 'string' },
    { key: 'containerUrl', label: 'Container URL', type: 'string' },
];

const TASK_RUN_SAMPLE = {
    ...ACTOR_RUN_SAMPLE,
    actorTaskId: 'UJNG9zau8PEB7U',
    detailsPageUrl: 'https://my.apify.com/tasks/UJNG9zau8PEB7U#/runs/HG7ML7M8z78YcAPEB',
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
    { key: 'items', label: 'Items' },
    { key: 'itemsFileUrls', label: 'Items file URLs', type: 'string' },
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

const DEFAULT_PAGINATION_LIMIT = 100;

// Actor ID of apify/legacy-phantomjs-crawler
const LEGACY_PHANTOM_JS_CRAWLER_ID = 'YPh5JENjSSR6vBf2E';

// Field to omit from actor run, these are useless in Zapier
const OMIT_ACTOR_RUN_FIELDS = ['meta', 'stats', 'options', 'userId'];

// Field to pick from dataset detail
const DATASET_PUBLISH_FIELDS = ['id', 'name', 'createdAt', 'modifiedAt', 'itemCount', 'cleanItemCount', 'actId', 'actRunId'];

const FETCH_DATASET_ITEMS_ITEMS_LIMIT = 100;

// List of allowed memory for actor run 128, 256, 512 ..
const ALLOWED_MEMORY_MBYTES_LIST = Array.from(
    Array(Math.log2(MAX_RUN_MEMORY_MBYTES / MIN_RUN_MEMORY_MBYTES) + 1),
    (x, i) => MIN_RUN_MEMORY_MBYTES * (2 ** i),
);

const DEFAULT_ACTOR_MEMORY_MBYTES = 2048;

module.exports = {
    APIFY_API_ENDPOINTS,
    ACTOR_RUN_SAMPLE,
    ACTOR_RUN_OUTPUT_FIELDS,
    TASK_RUN_SAMPLE,
    TASK_RUN_OUTPUT_FIELDS,
    DEFAULT_KEY_VALUE_STORE_KEYS,
    DEFAULT_PAGINATION_LIMIT,
    LEGACY_PHANTOM_JS_CRAWLER_ID,
    OMIT_ACTOR_RUN_FIELDS,
    DATASET_PUBLISH_FIELDS,
    FETCH_DATASET_ITEMS_ITEMS_LIMIT,
    ALLOWED_MEMORY_MBYTES_LIST,
    DEFAULT_ACTOR_MEMORY_MBYTES,
    DATASET_SAMPLE,
    DATASET_OUTPUT_FIELDS,
    KEY_VALUE_STORE_SAMPLE,
};
