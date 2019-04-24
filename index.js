const zapierCore = require('zapier-platform-core');
const apifyApp = require('./package.json');
const authentication = require('./src/authentication');
const { parseDataApiObject, includeApiToken, validateApiResponse } = require('./src/request_helpers');
const taskRunFinishedTrigger = require('./src/triggers/task_run_finished');
const tasksTrigger = require('./src/triggers/tasks');
const actorRunFinishedTrigger = require('./src/triggers/actor_run_finished');
const actorsTrigger = require('./src/triggers/actors');
const taskRunCreate = require('./src/creates/task_run');
const actorRunCreate = require('./src/creates/actor_run');
const setValueCreate = require('./src/creates/set_value');
const taskLastRunSearch = require('./src/searches/task_last_run');
const actorLastRunSearch = require('./src/searches/actor_last_run');
const getValueSearch = require('./src/searches/get_value');
const fetchItemsSearch = require('./src/searches/fetch_items');

/**
 * Apify APP definition
  */
const App = {
    version: apifyApp.version,
    platformVersion: zapierCore.version,

    authentication,

    beforeRequest: [
        includeApiToken,
    ],

    afterResponse: [
        parseDataApiObject,
        validateApiResponse,
    ],

    // If you want to define optional resources to simplify creation of triggers, searches, creates - do that here!
    resources: {
    },

    // If you want your trigger to show up, you better include it here!
    triggers: {
        [taskRunFinishedTrigger.key]: taskRunFinishedTrigger,
        [tasksTrigger.key]: tasksTrigger,
        [actorRunFinishedTrigger.key]: actorRunFinishedTrigger,
        [actorsTrigger.key]: actorsTrigger,
    },

    // If you want your searches to show up, you better include it here!
    searches: {
        [taskLastRunSearch.key]: taskLastRunSearch,
        [actorLastRunSearch.key]: actorLastRunSearch,
        [getValueSearch.key]: getValueSearch,
        [fetchItemsSearch.key]: fetchItemsSearch,
    },

    // If you want your creates to show up, you better include it here!
    creates: {
        [taskRunCreate.key]: taskRunCreate,
        [actorRunCreate.key]: actorRunCreate,
        [setValueCreate.key]: setValueCreate,
    },
};

module.exports = App;
