const { SERVER_ACTORS_LIST_URL, SERVER_ACTORS_PAGE_SIZE } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { printPrettyActorOrTaskName } = require('../apify_helpers');

// The snapshot record returns every item and ignores limit and offset, while the real Store API pages itself.
const isSnapshotRecord = SERVER_ACTORS_LIST_URL.includes('/key-value-stores/');

// Lists Server Actors from Apify Store for the Actor dropdown of Send Server Actor Request.
const listServerActors = async (z, bundle) => {
    const offset = (bundle.meta.page || 0) * SERVER_ACTORS_PAGE_SIZE;
    const response = await wrapRequestWithRetries(z.request, {
        url: SERVER_ACTORS_LIST_URL,
        // Ignored by the snapshot record, but sent, so switching to /v2/store works as it is.
        params: { limit: SERVER_ACTORS_PAGE_SIZE, offset },
    });

    // validateApiResponse lets a 404 on a key-value store record through, but an empty list would hide the problem.
    if (response.status === 404) {
        throw new z.errors.Error('The list of Server Actors isn\'t available. Enter the Actor ID instead.', 'NotFound', 404);
    }

    const items = (response.data && response.data.items) || [];
    const pageItems = isSnapshotRecord ? items.slice(offset, offset + SERVER_ACTORS_PAGE_SIZE) : items;
    return pageItems.map((actor) => ({
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
