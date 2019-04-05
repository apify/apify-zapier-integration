/**
 * Get paths of Apify API from apify-client
 * NOTE: We don't use ApifyClient from apify-client-js package in integration. Because if we use it,
 * we can not use z.request function and we lost logging and other function specific for
 * Zapier platform.
 */
const { BASE_PATH: usersPath } = require('apify-client/build/users');
const { BASE_PATH: webhooksPath } = require('apify-client/build/webhooks');
const { BASE_PATH: tasksPath } = require('apify-client/build/tasks');
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
};

const TASK_SAMPLE = {
    id: 'HG7ML7M8z78YcAPEB',
    buildId: 'HG7ML7M8z78YcAPEB',
    startedAt: '2015-11-30T07:34:24.202Z',
    finishedAt: '2015-12-12T09:30:12.202Z',
    status: 'SUCCEEDED',
    defaultKeyValueStoreId: 'sfAjeR4QmeJCQzTfe',
    defaultDatasetId: '3ZojQDdFTsyE7Moy4',
    defaultRequestQueueId: 'so93g2shcDzK3pA85',
    INPUT: {
        foo: 'bar',
    },
    OUTPUT: {
        foo: 'bar',
    },
    datasetItems: [
        {
            foo: 'bar',
        },
    ],
};

const TASK_OUTPUT_FIELDS = [
    { key: 'id', label: 'ID' },
    { key: 'buildId', label: 'Build ID' },
    { key: 'startedAt', label: 'Created At' },
    { key: 'finishedAt', label: 'Created At' },
    { key: 'status', label: 'Status' },
    { key: 'defaultKeyValueStoreId', label: 'Default Key Value Store ID' },
    { key: 'defaultDatasetId', label: 'Default Dataset ID' },
    { key: 'defaultRequestQueueId', label: 'Default Request Queue ID' },
];

const DEFAULT_KEY_VALUE_STORE_KEYS = ['INPUT', 'OUTPUT'];

module.exports = {
    APIFY_API_ENDPOINTS,
    TASK_SAMPLE,
    TASK_OUTPUT_FIELDS,
    DEFAULT_KEY_VALUE_STORE_KEYS,
};
