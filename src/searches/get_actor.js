const _ = require('lodash');
const {
    ACTOR_SAMPLE,
    ACTOR_OUTPUT_FIELDS,
    APIFY_API_ENDPOINTS,
} = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');

const CURATED_ACTOR_FIELDS = [
    'id',
    'name',
    'title',
    'description',
    'username',
    'isPublic',
    'actorPermissionLevel',
    'stats',
    'defaultRunOptions',
];

const getActorDetails = async (z, bundle) => {
    const { actorId } = bundle.inputData;

    // The REST path expects the `<username>~<actorName>` form, so a `username/name` slug
    // (e.g. `apify/web-scraper`) must have its `/` replaced with `~`. Plain Actor IDs pass through.
    const normalizedActorId = actorId.replace('/', '~');

    let actorResponse;
    try {
        actorResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${normalizedActorId}`,
        });
    } catch (err) {
        if (err.message.includes('not found')) return [];

        throw err;
    }

    const actor = _.pick(actorResponse.data, CURATED_ACTOR_FIELDS);
    return [actor];
};

module.exports = {
    key: 'getActorDetails',
    noun: 'Actor',
    display: {
        label: 'Get Actor Details',
        description: 'Retrieves metadata and description for a specific Actor, including its title, description, '
            + 'and whether it is publicly available. Use this to confirm an actor is suitable before running it.',
    },

    operation: {
        inputFields: [
            {
                label: 'Actor',
                key: 'actorId',
                required: true,
                type: 'string',
                helpText: 'Actor ID or username/name slug, e.g. `apify/web-scraper`.',
            },
        ],

        perform: getActorDetails,

        sample: ACTOR_SAMPLE,
        outputFields: ACTOR_OUTPUT_FIELDS,
    },
};
