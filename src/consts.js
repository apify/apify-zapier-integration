/**
 * Get paths of Apify API from apify-client-js
 * NOTE: We don't use ApifyClient from apify-client-js package in integration. Because if we use it,
 * we can not use z.request function and we lost logging and other function specific for
 * Zapier platform.
 */
const { BASE_PATH: usersPath } = require('apify-client/build/users');
const { BASE_PATH: webhooksPath } = require('apify-client/build/webhooks');
const { BASE_PATH: tasksPath } = require('apify-client/build/tasks');

const APIFY_API_BASE_URL = 'https://api.apify.com';

/**
 * Apify API URL endpoints, which we will use in integration.
 */
const APIFY_API_ENDPOINTS = {
    users: `${APIFY_API_BASE_URL}${usersPath}`,
    webhooks: `${APIFY_API_BASE_URL}${webhooksPath}`,
    tasks: `${APIFY_API_BASE_URL}${tasksPath}`,
};

module.exports = {
    APIFY_API_ENDPOINTS,
};
