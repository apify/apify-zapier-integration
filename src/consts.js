const { KEY_VALUE_STORE_KEYS } = require('apify-shared/consts');

/**
 * Get paths of Apify API from apify-client
 * NOTE: We don't use ApifyClient from apify-client-js package in integration. Because if we use it,
 * we can not use z.request function and we lost logging and other function specific for
 * Zapier platform.
 */
const { BASE_PATH: usersPath } = require('apify-client/build/users');
const { BASE_PATH: webhooksPath } = require('apify-client/build/webhooks');
const { BASE_PATH: tasksPath } = require('apify-client/build/tasks');
const { BASE_PATH: actorsPath } = require('apify-client/build/acts');
const { BASE_PATH: datasetsPath } = require('apify-client/build/datasets');
const { BASE_PATH: keyValueStoresPath } = require('apify-client/build/key_value_stores');

const APIFY_API_BASE_URL = 'https://api.apify.com';

/**
 * Apify API URL endpoints, which we will use in integration.
 */
const APIFY_API_ENDPOINTS = {
    users: `${APIFY_API_BASE_URL}${usersPath}`,
    webhooks: `${APIFY_API_BASE_URL}${webhooksPath}`,
    tasks: `${APIFY_API_BASE_URL}${tasksPath}`,
    datasets: `${APIFY_API_BASE_URL}${datasetsPath}`,
    keyValueStores: `${APIFY_API_BASE_URL}${keyValueStoresPath}`,
    actors: `${APIFY_API_BASE_URL}${actorsPath}`,
};

const ACTOR_RUN_SAMPLE = {
    id: 'HG7ML7M8z78YcAPEB',
    buildId: '7ML7M8zcAPEB78Y',
    startedAt: '2015-11-30T07:34:24.202Z',
    finishedAt: '2015-12-12T09:30:12.202Z',
    status: 'SUCCEEDED',
    defaultKeyValueStoreId: 'sfAjeR4QmeJCQzTfe',
    defaultDatasetId: '3ZojQDdFTsyE7Moy4',
    defaultRequestQueueId: 'so93g2shcDzK3pA85',
    OUTPUT: {},
    datasetItems: [{}],
};

const ACTOR_RUN_OUTPUT_FIELDS = [
    { key: 'id', label: 'ID', type: 'string' },
    { key: 'buildId', label: 'Build ID', type: 'string' },
    { key: 'startedAt', label: 'Created at' },
    { key: 'finishedAt', label: 'Created at' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'defaultKeyValueStoreId', label: 'Default key-value store ID', type: 'string' },
    { key: 'defaultDatasetId', label: 'Default dataset ID', type: 'string' },
    { key: 'defaultRequestQueueId', label: 'Default request queue ID', type: 'string' },
];

const TASK_RUN_SAMPLE = Object.assign({ actorTaskId: 'UJNG9zau8PEB7U' }, ACTOR_RUN_SAMPLE);

const TASK_RUN_OUTPUT_FIELDS = ACTOR_RUN_OUTPUT_FIELDS.concat([{ key: 'actorTaskId', label: 'Actor task ID', type: 'string' }]);

const DEFAULT_KEY_VALUE_STORE_KEYS = [KEY_VALUE_STORE_KEYS.OUTPUT];

const DEFAULT_PAGINATION_LIMIT = 100;

// Actor ID of apify/legacy-phantomjs-crawler
const LEGACY_PHANTOM_JS_CRAWLER_ID = 'YPh5JENjSSR6vBf2E';

// Field to omit from actor run, these are useless in Zapier
const OMIT_ACTOR_RUN_FIELDS = ['meta', 'stats'];

// Field to pick from dataset detail
const DATASET_PUBLISH_FIELDS = ['id', 'name', 'createdAt', 'modifiedAt', 'itemCount', 'cleanItemCount', 'actId', 'actRunId'];


const FETCH_DATASET_ITEMS_ITEMS_LIMIT = 500;

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
};
