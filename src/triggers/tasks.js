const { APIFY_API_ENDPOINTS } = require('../consts');

// Fetches a list of tasks
const getTaskList = async (z, bundle) => {
    const taskListResponse = await z.request(`${APIFY_API_ENDPOINTS.tasks}`);
    return taskListResponse.json.items.map((task) => ({
        id: task.id,
        name: task.name,
    }));
};

module.exports = {
    key: 'tasks',
    noun: 'Tasks',
    display: {
        label: 'List of Tasks',
        description: 'This is a hidden trigger, and is used in a Dynamic Dropdown within this app',
        hidden: true,
    },
    operation: {
        // since this is a "hidden" trigger, there aren't any inputFields needed
        perform: getTaskList,
        canPaginate: false, // TODO: Add pagination
    },
};
