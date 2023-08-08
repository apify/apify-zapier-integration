const { APIFY_API_ENDPOINTS, DEFAULT_PAGINATION_LIMIT } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { printPrettyActorOrTaskName } = require('../apify_helpers');

// Fetches a list of tasks
const getTaskList = async (z, bundle) => {
    const taskListResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}`,
        params: {
            limit: DEFAULT_PAGINATION_LIMIT,
            offset: bundle.meta.page ? bundle.meta.page * DEFAULT_PAGINATION_LIMIT : 0,
        },
    });
    return taskListResponse.data.items.map((task) => ({
        id: task.id,
        name: printPrettyActorOrTaskName(task),
    }));
};

/**
 * This is hidden trigger used to load tasks to dynamic dropdown.
 */
module.exports = {
    key: 'tasks',
    noun: 'Tasks',
    display: {
        label: 'List of Tasks',
        description: 'This is a hidden trigger used in a Dynamic Dropdown within this app',
        hidden: true,
    },
    operation: {
        // since this is a "hidden" trigger, there aren't any inputFields needed
        perform: getTaskList,
        canPaginate: true,
    },
};
