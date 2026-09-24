const _ = require('lodash');
const {
    ACTOR_SAMPLE,
    ACTOR_OUTPUT_FIELDS,
    APIFY_API_ENDPOINTS,
} = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');

// Deep property paths passed to `_.pick`. Nested objects (`stats`, `defaultRunOptions`) are
// trimmed to the sub-fields we actually expose, so the output matches the declared output fields
// instead of leaking noise (review ratings, per-day user counts, `restartOnError`, …).
// `taggedBuilds` is picked whole because its keys are per-Actor build tags (dynamic, not fixed).
const CURATED_ACTOR_FIELDS = [
    'id',
    'name',
    'title',
    'description',
    'username',
    'isPublic',
    'actorPermissionLevel',
    'createdAt',
    'modifiedAt',
    'standbyUrl',
    'stats.totalRuns',
    'stats.totalUsers',
    'stats.lastRunStartedAt',
    'defaultRunOptions.build',
    'defaultRunOptions.timeoutSecs',
    'defaultRunOptions.memoryMbytes',
    'taggedBuilds',
];

const getActorDetails = async (z, bundle) => {
    const { actorId } = bundle.inputData;

    // The REST path expects the `<username>~<actorName>` form, so a `username/name` slug
    // (e.g. `apify/web-scraper`) must have its `/` replaced with `~`. Plain Actor IDs pass through.
    // Trim and replace all slashes so stray whitespace or a trailing `/` can't malform the path.
    const normalizedActorId = actorId.trim().replaceAll('/', '~');

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

    // `taggedBuilds` is keyed by dynamic build tags (e.g. `latest`, `version-3`); keep only the
    // build ID and version per tag and drop the noise (`finishedAt`, `buildNumberInt`).
    if (actor.taggedBuilds) {
        actor.taggedBuilds = _.mapValues(actor.taggedBuilds, (build) => _.pick(build, ['buildId', 'buildNumber']));
    }

    return [actor];
};

module.exports = {
    key: 'getActorDetails',
    noun: 'Actor',
    display: {
        label: 'Get Actor Details',
        description: 'Retrieves metadata and description for a specific Actor, including its title, description, '
            + 'and whether it is publicly available. Use this to confirm an Actor is suitable before running it.',
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
