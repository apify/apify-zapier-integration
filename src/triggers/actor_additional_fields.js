const { getActorAdditionalFields } = require('../apify_helpers');

/**
 * This is hidden trigger is used to test getActorAdditionalFields function.
 * It is only way how to test function like that in Zapier context,
 * check my issue https://github.com/zapier/zapier-platform-cli/issues/418
 */
module.exports = {
    key: 'getActorAdditionalFieldsTest',
    noun: 'Actor Additional Fields',
    display: {
        label: 'Actor Additional Fields',
        description: 'This is a hidden trigger used to test getActorAdditionalFields function.',
        hidden: true,
    },
    operation: {
        // since this is a "hidden" trigger, there aren't any inputFields needed
        perform: getActorAdditionalFields,
    },
};
