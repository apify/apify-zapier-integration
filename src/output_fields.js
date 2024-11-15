const _ = require('lodash');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');
const { getDatasetItems } = require('./apify_helpers');
const { wrapRequestWithRetries } = require('./request_helpers');
const { APIFY_API_ENDPOINTS } = require('./consts');
const { convertPlainObjectToFieldSchema } = require('./zapier_helpers');

/**
 * Transforms object items to output fields.
 * @param {string} datasetId
 * @returns {Promise<*[]>}
 */
const getDatasetItemsOutputFields = async (z, datasetId, actorId, keyPrefix = 'datasetItems[]') => {
    let datasetItems;
    try {
        datasetItems = await getDatasetItems(z, datasetId, {
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

const getDatasetOutputFields = async (z, bundle) => {
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
        // 404 status = There is not successful run yet.
        if (err.status !== 404) {
            z.console.error('Error while fetching dataset items', err);
        }
        // Return default output fields, if there is no successful run yet or any other error.
        return [];
    }
    const { data: run } = lastSuccessDatasetItems;
    return getDatasetItemsOutputFields(z, run.defaultDatasetId, actorId);
};

module.exports = {
    getDatasetItemsOutputFields,
    getDatasetOutputFields,
};
