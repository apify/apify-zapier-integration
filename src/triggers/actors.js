const { APIFY_API_ENDPOINTS, DEFAULT_PAGINATION_LIMIT } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');

// Fetches a list of actors
// TODO: Adds logic to load featured actors.
const getActorList = async (z, bundle) => {
    const actorListResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}`,
        params: {
            limit: DEFAULT_PAGINATION_LIMIT,
            offset: bundle.meta.page ? bundle.meta.page * DEFAULT_PAGINATION_LIMIT : 0,
        },
    });
    return actorListResponse.json.items.map((actor) => ({
        id: actor.id,
        name: actor.name,
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
