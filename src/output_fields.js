const _ = require('lodash');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');
const { getDatasetItems } = require('./apify_helpers');
const { wrapRequestWithRetries, isNotFoundError } = require('./request_helpers');
const { APIFY_API_ENDPOINTS } = require('./consts');
const { convertPlainObjectToFieldSchema } = require('./zapier_helpers');

/**
 * Download items from dataset and create FieldSchema out of them.
 * @param {string} datasetId
 * @returns {Promise<*[]>}
 */
const getDatasetItemsOutputFields = async (z, datasetId, actorId, token, keyPrefix = 'datasetItems[]') => {
    let datasetItems;
    try {
        datasetItems = await getDatasetItems(z, datasetId, token, {
            limit: 10,
        }, actorId);
    } catch (err) {
        z.console.error('Error while fetching dataset items', err);
        // Return default output fields, if there is no successful run yet or any other error.
        return [];
    }

    const { items } = datasetItems;
    // If there are no items, return default output fields.
    if (items.length === 0) return [];
    // NOTE: We are using the first 10 items to generate output fields to cover most of the cases.
    const mergedItem = _.merge({}, ...items);
    return convertPlainObjectToFieldSchema(mergedItem, keyPrefix);
};

const getActorDatasetOutputFields = async (z, bundle) => {
    const { actorId } = bundle.inputData;
    let lastSuccessDatasetItems;
    try {
        lastSuccessDatasetItems = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${actorId}/runs/last`,
            params: {
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        });
    } catch (err) {
        if (!isNotFoundError(err)) {
            z.console.error('Error while fetching dataset items', err);
        }
        return [];
    }
    const { data: run } = lastSuccessDatasetItems;
    return getDatasetItemsOutputFields(z, run.defaultDatasetId, actorId);
};

/**
 * Loads dynamic dataset output fields for a search/action that is identified by a run ID
 * (e.g. "Get Actor Run by ID"), where the Actor ID is not part of the input. It fetches the
 * run itself to resolve its default dataset and derives the fields from that dataset's items.
 */
const getRunDatasetOutputFields = async (z, bundle) => {
    const { runId } = bundle.inputData;
    if (!runId) return [];

    let runResponse;
    try {
        runResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actorRuns}/${runId}`,
        });
    } catch (err) {
        if (!isNotFoundError(err)) {
            z.console.error('Error while fetching run for output fields', err);
        }
        return [];
    }

    const { data: run } = runResponse;
    if (!run || !run.defaultDatasetId) return [];

    return getDatasetItemsOutputFields(z, run.defaultDatasetId, run.actId);
};

const getTaskDatasetOutputFields = async (z, bundle) => {
    const { taskId } = bundle.inputData;
    let lastSuccessDatasetItems;
    try {
        lastSuccessDatasetItems = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}/runs/last`,
            params: {
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        });
    } catch (err) {
        if (!isNotFoundError(err)) {
            z.console.error('Error while fetching dataset items', err);
        }
        return [];
    }
    const { data: run } = lastSuccessDatasetItems;
    return getDatasetItemsOutputFields(z, run.defaultDatasetId, run.actId);
};

module.exports = {
    getDatasetItemsOutputFields,
    getActorDatasetOutputFields,
    getRunDatasetOutputFields,
    getTaskDatasetOutputFields,
};
