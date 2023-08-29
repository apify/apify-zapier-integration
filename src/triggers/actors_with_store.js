const { APIFY_API_ENDPOINTS, DEFAULT_PAGINATION_LIMIT } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { printPrettyActorOrTaskName } = require('../apify_helpers');

// Count of top store Actors to be fetched from store and always be the first in dropdown.
const TOP_PUBLIC_ACTORS_LIMIT = 15;

const getActorList = async (z, { offset, limit }) => {
    return wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}`,
        params: {
            offset,
            limit,
        },
    });
};

const getStoreActorList = async (z, { offset, limit }) => {
    return wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.store}`,
        params: {
            limit,
            offset,
        },
    });
};

/**
 * Fetches a list of user's Actors and Actors from store.
 * The pagination is handled in way the first returns top store Actors, user's Actors and them Actors from store.
 * @param z
 * @param bundle
 * @returns {Promise<*>}
 */
const getActorWithStoreList = async (z, bundle) => {
    // NOTE: Zapier UI can handle duplicates in dropdowns, but it's not possible to have duplicates in single page.
    const actors = new Map();

    // 1. This is for marketing purposes, show top public Actors from store the first.
    if (!bundle.meta.page) {
        const { data: topPublicActorList } = await getStoreActorList(z, { limit: TOP_PUBLIC_ACTORS_LIMIT, offset: 0 });
        topPublicActorList.items.forEach((actor) => actors.set(actor.id, actor));
    }

    // 2. Add user's Actors
    const { data: actorList } = await getActorList(z, {
        limit: DEFAULT_PAGINATION_LIMIT,
        offset: bundle.meta.page ? bundle.meta.page * DEFAULT_PAGINATION_LIMIT : 0,
    });
    actorList.items.forEach((actor) => actors.set(actor.id, actor));

    // 3. Add Actors from Store
    if (actorList.items.length < DEFAULT_PAGINATION_LIMIT) {
        // NOTE: Offset needs to be set based on already loaded actors from list of Actors
        // and Actors from store.
        const limit = DEFAULT_PAGINATION_LIMIT - actorList.items.length;
        const pageNumberDilutedActorList = bundle.meta.page - Math.floor(actorList.total / DEFAULT_PAGINATION_LIMIT);
        const offset = Math.max(
            TOP_PUBLIC_ACTORS_LIMIT,
            (pageNumberDilutedActorList * DEFAULT_PAGINATION_LIMIT - (actorList.total % DEFAULT_PAGINATION_LIMIT)) + TOP_PUBLIC_ACTORS_LIMIT,
        );

        const { data: storeActorList } = await getStoreActorList(z, { limit, offset });
        storeActorList.items.forEach((actor) => actors.set(actor.id, actor));
    }

    return Array.from(actors.values()).map((actor) => ({
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
