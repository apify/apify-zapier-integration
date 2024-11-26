const { getActorDatasetOutputFields } = require('../output_fields');

/**
 * This is hidden trigger is used to test getActorDatasetOutputFields function.
 * It is only way how to test function like that in Zapier context,
 * check my issue https://github.com/zapier/zapier-platform-cli/issues/418
 */
module.exports = {
    key: 'getActorDatasetOutputFieldsTest',
    noun: 'Dataset Output Additional Fields',
    display: {
        label: 'Dataset Output Additional Fields',
        description: 'This is a hidden trigger used to test getActorDatasetOutputFields function.',
        hidden: true,
    },
    operation: {
        // since this is a "hidden" trigger, there aren't any inputFields needed
        perform: getActorDatasetOutputFields,
    },
};
