const authentication = require('./src/authentication');
const { parseDataApiObject, includeApiToken, validateApifyApiResponse } = require('./src/request_middlewares');
const taskRunFinishedTrigger = require('./src/triggers/task_run_finished');
const tasksTrigger = require('./src/triggers/tasks');
const taskRunCreate = require('./src/creates/task_run');

/**
 * Apify APP definition
  */
const App = {
    version: require('./package.json').version,
    platformVersion: require('zapier-platform-core').version,

    authentication,

    beforeRequest: [
        includeApiToken,
    ],

    afterResponse: [
        parseDataApiObject,
        validateApifyApiResponse,
    ],

    // If you want to define optional resources to simplify creation of triggers, searches, creates - do that here!
    resources: {
    },

    // If you want your trigger to show up, you better include it here!
    triggers: {
        [taskRunFinishedTrigger.key]: taskRunFinishedTrigger,
        [tasksTrigger.key]: tasksTrigger,
    },

    // If you want your searches to show up, you better include it here!
    searches: {
    },

    // If you want your creates to show up, you better include it here!
    creates: {
        [taskRunCreate.key]: taskRunCreate,
    },
};

module.exports = App;
