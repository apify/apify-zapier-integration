const { Agent } = require('https');

const { ActorListSortBy } = require('apify-client');
const { APIFY_API_ENDPOINTS, DEFAULT_PAGINATION_LIMIT, RECENTLY_USED_ACTORS_KEY, STORE_ACTORS_KEY } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { printPrettyActorOrTaskName } = require('../apify_helpers');

class PatchedKeepAliveAgent extends Agent {
    // eslint-disable-next-line no-useless-constructor
    constructor(opts) {
        super(opts);
    }

    addRequest(req, options) {
        req.once('socket', (socket) => {
            socket.setMaxListeners(0);
        });
        super.addRequest(req, options);
    }
}

const keepAliveAgent = new PatchedKeepAliveAgent({
    keepAlive: true,
    maxSockets: 5,
});

const getActorList = async (z, { offset, limit }) => {
    return wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}`,
        params: {
            offset,
            limit,
            sortBy: ActorListSortBy.LAST_RUN_STARTED_AT,
            desc: 1,
        },
    });
};

const getStoreActorList = async (z, { offset, limit }) => {
    return wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.store}`,
        params: {
            limit,
            offset,
            sortBy: 'popularity',
        },
        agent: keepAliveAgent,
        headers: { 'Accept-Encoding': 'identity' },
    });
};

/**
 * Fetches a list of Actors, either recently used or from the Apify store. Recently used Actors are used by default.
 *
 * @param z
 * @param bundle
 * @returns {Promise<*>}
 */
const getActorWithStoreList = async (z, bundle) => {
    const source = bundle.inputData.searchLocation || RECENTLY_USED_ACTORS_KEY;

    const fetchFn = source === STORE_ACTORS_KEY ? getStoreActorList : getActorList;

    const actors = await fetchFn(z, {
        limit: DEFAULT_PAGINATION_LIMIT,
        offset: bundle.meta.page ? bundle.meta.page * DEFAULT_PAGINATION_LIMIT : 0,
    });

    return actors.data.items.map((actor) => ({
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
