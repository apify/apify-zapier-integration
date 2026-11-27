const { APIFY_API_ENDPOINTS, SERVER_ACTOR_STORE_CATEGORIES, SERVER_ACTORS_PAGE_SIZE } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { printPrettyActorOrTaskName } = require('../apify_helpers');

// Lists Server Actors from Apify Store for the Actor dropdown of Send Server Actor Request.
const listServerActors = async (z, bundle) => {
    const response = await wrapRequestWithRetries(z.request, {
        url: APIFY_API_ENDPOINTS.store,
        params: {
            category: SERVER_ACTOR_STORE_CATEGORIES,
            limit: SERVER_ACTORS_PAGE_SIZE,
            offset: (bundle.meta.page || 0) * SERVER_ACTORS_PAGE_SIZE,
            sortBy: 'popularity',
        },
    });

    const items = (response.data && response.data.items) || [];
    return items.map((actor) => ({
        id: actor.id,
        name: printPrettyActorOrTaskName(actor),
    }));
};

/**
 * This is hidden trigger used to load Server Actors to dynamic dropdown.
 */
module.exports = {
    key: 'serverActors',
    noun: 'Server Actors',
    display: {
        label: 'List of Server Actors',
        description: 'This is a hidden trigger used in a Dynamic Dropdown within this app',
        hidden: true,
    },
    operation: {
        perform: listServerActors,
        canPaginate: true,
    },
};
