const _ = require('lodash');
const {
    STORE_ACTOR_SAMPLE,
    STORE_ACTOR_OUTPUT_FIELDS,
    APIFY_API_ENDPOINTS,
} = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');

const DEFAULT_STORE_SEARCH_LIMIT = 10;

// Top-level fields kept from each store item. `stats` popularity/recency signals are
// flattened separately below into `stats__*` keys, so `stats` itself is not picked.
const CURATED_STORE_ACTOR_FIELDS = [
    'id',
    'name',
    'title',
    'description',
    'username',
    'url',
    'categories',
];

/**
 * Curates a single Apify Store item down to the fields an agent needs to select
 * an Actor and chain it into Run Actor / Get Actor Details.
 */
const curateStoreActor = (item) => {
    const actor = _.pick(item, CURATED_STORE_ACTOR_FIELDS);
    const stats = item.stats || {};

    return {
        ...actor,
        stats__totalRuns: stats.totalRuns,
        stats__totalUsers: stats.totalUsers,
        stats__lastRunStartedAt: stats.lastRunStartedAt,
    };
};

const searchApifyStore = async (z, bundle) => {
    const { query, offset } = bundle.inputData;
    const limit = bundle.inputData.limit || DEFAULT_STORE_SEARCH_LIMIT;

    const params = { search: query, limit };
    // Only send `offset` when provided, otherwise it serializes as an empty `offset=` query param.
    if (offset !== undefined && offset !== null && offset !== '') params.offset = offset;

    const response = await wrapRequestWithRetries(z.request, {
        url: APIFY_API_ENDPOINTS.store,
        params,
    });

    // After the `parseDataApiObject` middleware the store payload is `{ total, count, ..., items }`.
    const items = response.data.items || [];
    return items.map(curateStoreActor);
};

module.exports = {
    key: 'searchApifyStore',
    noun: 'Actor',
    display: {
        label: 'Search Apify Store',
        description: 'Searches the public Apify Store for Actors matching a keyword or use case '
            + '(e.g. "linkedin scraper", "google maps", "instagram"). Returns matching actors with their IDs, '
            + 'which can be passed directly to the Run Actor action.',
    },

    operation: {
        inputFields: [
            {
                label: 'Search query',
                key: 'query',
                required: true,
                type: 'string',
                helpText: 'Keyword or use-case description to search the Apify Store for, e.g. `linkedin scraper`.',
            },
            {
                label: 'Limit',
                key: 'limit',
                required: false,
                type: 'integer',
                // Zapier field defaults must be strings, even for integer fields.
                default: String(DEFAULT_STORE_SEARCH_LIMIT),
                helpText: 'Maximum number of Actors to return. Keep this small (the default is 10) — '
                    + 'a short, most-relevant list is easier for an agent to pick from than hundreds of results.',
            },
            {
                label: 'Offset',
                key: 'offset',
                required: false,
                type: 'integer',
                helpText: 'Number of Actors to skip from the start of the results, e.g. `10` to fetch the next page.',
            },
        ],

        perform: searchApifyStore,

        sample: STORE_ACTOR_SAMPLE,
        outputFields: STORE_ACTOR_OUTPUT_FIELDS,
    },
};
