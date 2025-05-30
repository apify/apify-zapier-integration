const zapierCore = require('zapier-platform-core');
const apifyApp = require('./package.json');
const authentication = require('./src/authentication');
const { parseDataApiObject, setApifyRequestHeaders, validateApiResponse } = require('./src/request_helpers');
const taskRunFinishedTrigger = require('./src/triggers/task_run_finished');
const tasksTrigger = require('./src/triggers/tasks');
const actorRunFinishedTrigger = require('./src/triggers/actor_run_finished');
const actorsTrigger = require('./src/triggers/actors');
const actorsWithStoreTrigger = require('./src/triggers/actors_with_store');
const getActorAdditionalFieldsTest = require('./src/triggers/actor_additional_fields');
const getActorDatasetOutputFieldsTest = require('./src/triggers/actor_dataset_additional_output_fields');
const taskRunCreate = require('./src/creates/task_run');
const actorRunCreate = require('./src/creates/actor_run');
const scrapeSingleUrlCreate = require('./src/creates/scrape_single_url');
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
        setApifyRequestHeaders,
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
        [getActorAdditionalFieldsTest.key]: getActorAdditionalFieldsTest,
        [getActorDatasetOutputFieldsTest.key]: getActorDatasetOutputFieldsTest,
        [actorsWithStoreTrigger.key]: actorsWithStoreTrigger,
    },

    hydrators: {
        ...getValueSearch.hydrators,
    },

    // If you want your searches to show up, you better include it here!
    searches: {
        [taskLastRunSearch.key]: taskLastRunSearch,
        [actorLastRunSearch.key]: actorLastRunSearch,
        [getValueSearch.perform.key]: getValueSearch.perform,
        [fetchItemsSearch.key]: fetchItemsSearch,
    },

    // If you want your creates to show up, you better include it here!
    creates: {
        [taskRunCreate.key]: taskRunCreate,
        [actorRunCreate.key]: actorRunCreate,
        [setValueCreate.key]: setValueCreate,
        [scrapeSingleUrlCreate.key]: scrapeSingleUrlCreate,
    },
};

module.exports = App;
