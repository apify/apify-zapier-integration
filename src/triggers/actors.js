const { ActorListSortBy } = require('apify-client');
const { APIFY_API_ENDPOINTS, DEFAULT_PAGINATION_LIMIT } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { printPrettyActorOrTaskName } = require('../apify_helpers');

// Fetches a list of actors
const getActorList = async (z, bundle) => {
    const actorListResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}`,
        params: {
            limit: DEFAULT_PAGINATION_LIMIT,
            offset: bundle.meta.page ? bundle.meta.page * DEFAULT_PAGINATION_LIMIT : 0,
            sortBy: ActorListSortBy.LAST_RUN_STARTED_AT,
            desc: 1,
        },
    });
    return actorListResponse.data.items.map((actor) => ({
        id: actor.id,
        name: printPrettyActorOrTaskName(actor),
    }));
};

/**
 * This is hidden trigger used to load actors to dynamic dropdown.
 */
module.exports = {
    key: 'actors',
    noun: 'Actors',
    display: {
        label: 'List of actors',
        description: 'This is a hidden trigger used in a Dynamic Dropdown within this app',
        hidden: true,
    },
    operation: {
        // since this is a "hidden" trigger, there aren't any inputFields needed
        perform: getActorList,
        canPaginate: true,
    },
};
