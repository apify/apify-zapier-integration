const { APIFY_API_ENDPOINTS, DEFAULT_PAGINATION_LIMIT } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { printPrettyActorOrTaskName } = require('../apify_helpers');

/**
 * Fetches a list of Actors and possibly add Actors from store.
 * The pagination is handled in way the first returns user's Actors and them Actors from store.
 * @param z
 * @param bundle
 * @returns {Promise<*>}
 */
const getActorWithStoreList = async (z, bundle) => {
    const { data: actorList } = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}`,
        params: {
            limit: DEFAULT_PAGINATION_LIMIT,
            offset: bundle.meta.page ? bundle.meta.page * DEFAULT_PAGINATION_LIMIT : 0,
        },
    });
    const actors = actorList.items;

    // Add Actors from Store
    if (actorList.items.length < DEFAULT_PAGINATION_LIMIT) {
        // NOTE: Offset needs to be set based on already loaded actors from list of Actors
        // and Actors from store.
        const limit = DEFAULT_PAGINATION_LIMIT - actorList.items.length;
        const pageNumberDilutedActorList = bundle.meta.page - Math.floor(actorList.total / DEFAULT_PAGINATION_LIMIT);
        const offset = Math.max(
            0,
            pageNumberDilutedActorList * DEFAULT_PAGINATION_LIMIT - (actorList.total % DEFAULT_PAGINATION_LIMIT),
        );

        const { data: storeActorList } = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.store}`,
            params: {
                limit,
                offset,
            },
        });
        actors.push(...storeActorList.items);
    }

    return actors.map((actor) => ({
        id: actor.id,
        name: printPrettyActorOrTaskName(actor),
    }));
};

/**
 * This is hidden trigger used to load actors to dynamic dropdown.
 */
module.exports = {
    key: 'actorsWithStore',
    noun: 'Actors',
    display: {
        label: 'List of Actors including Actors from store',
        description: 'This is a hidden trigger used in a Dynamic Dropdown within this app',
        hidden: true,
    },
    operation: {
        // since this is a "hidden" trigger, there aren't any inputFields needed
        perform: getActorWithStoreList,
        canPaginate: true,
    },
};
