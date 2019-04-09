const { APIFY_API_ENDPOINTS } = require('../consts');

const DEFAULT_PAGINATION_LIMIT = 100;

// Fetches a list of tasks
const getTaskList = async (z, bundle) => {
    const taskListResponse = await z.request(`${APIFY_API_ENDPOINTS.tasks}`, {
        limit: DEFAULT_PAGINATION_LIMIT,
        offset: bundle.meta.page ? bundle.meta.page * DEFAULT_PAGINATION_LIMIT : 0
    });
    return taskListResponse.json.items.map((task) => ({
        id: task.id,
        name: task.name,
    }));
};

module.exports = {
    key: 'tasks',
    noun: 'Tasks',
    display: {
        label: 'List of tasks',
        description: 'This is a hidden trigger, and is used in a Dynamic Dropdown within this app',
        hidden: true,
    },
    operation: {
        // since this is a "hidden" trigger, there aren't any inputFields needed
        perform: getTaskList,
        canPaginate: true,
    },
};
