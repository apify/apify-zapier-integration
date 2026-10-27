const _ = require('lodash');
const {
    STORE_ACTOR_SAMPLE,
    STORE_ACTOR_OUTPUT_FIELDS,
    APIFY_API_ENDPOINTS,
} = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');

const DEFAULT_STORE_SEARCH_LIMIT = 10;

// Deep property paths passed to `_.pick`. `stats` stays nested and trimmed to the popularity/recency
// signals, because Zapier resolves `stats__*` output field keys as a path into `stats`, a literal
// `stats__totalRuns` key would not get its label.
const CURATED_STORE_ACTOR_FIELDS = [
    'id',
    'name',
    'title',
    'description',
    'username',
    'url',
    'categories',
    'stats.totalRuns',
    'stats.totalUsers',
    'stats.lastRunStartedAt',
];

/**
 * Curates a single Apify Store item down to the fields an agent needs to select
 * an Actor and chain it into Run Actor. `actorSlug` is added because the API finds an Actor
 * by ID or `username~name` only, so the bare `name` can't be passed to Run Actor.
 */
// `actorSlug` goes first, because the Zap editor lists result fields in the order of the data.
const curateStoreActor = (item) => ({
    actorSlug: `${item.username}~${item.name}`,
    ..._.pick(item, CURATED_STORE_ACTOR_FIELDS),
});

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
    noun: 'Store Actor',
    display: {
        label: 'Search Apify Store',
        description: 'Searches Apify Store for Actors that match a keyword or use case, e.g. "linkedin scraper" or "google maps". '
            + 'Returns the matching Actors. To run one, map its Actor ID or Actor slug to the Actor field of Run Actor.',
    },

    operation: {
        inputFields: [
            {
                label: 'Search query',
                key: 'query',
                required: true,
                type: 'string',
                helpText: 'Keyword or use-case description to search Apify Store for, e.g. `linkedin scraper`.',
            },
            {
                label: 'Limit',
                key: 'limit',
                required: false,
                type: 'integer',
                // Zapier field defaults must be strings, even for integer fields.
                default: String(DEFAULT_STORE_SEARCH_LIMIT),
                helpText: 'Maximum number of Actors to return, 10 by default. A Zap uses only the first one '
                    + 'unless **If multiple search results are found?** is set to return all. AI agents get all of them.',
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
