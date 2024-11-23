const _ = require('lodash');
const dayjs = require('dayjs');
/**
 * Converts a plain object to an array of FieldSchema objects.
 * https://github.com/zapier/zapier-platform/blob/main/packages/schema/docs/build/schema.md#fieldschema
 * @param object
 * @param keyPrefix
 * @returns {*[]}
 */
const convertPlainObjectToFieldSchema = (object, keyPrefix = '') => {
    if (!_.isPlainObject(object)) return [];

    const fieldSchema = [];

    Object.entries(object).forEach(([key, value]) => {
        const fullKey = keyPrefix ? `${keyPrefix}${key}` : key;

        if (_.isString(value)) {
            fieldSchema.push({ key: fullKey, type: dayjs(value).isValid() ? 'datetime' : 'string' });
        } else if (_.isNumber(value)) {
            fieldSchema.push({ key: fullKey, type: 'number' });
        } else if (_.isBoolean(value)) {
            fieldSchema.push({ key: fullKey, type: 'boolean' });
        } else if (_.isArray(value)) {
            // Process array elements. If array contains objects, use keys with []
            if (_.isPlainObject(value[0])) {
                fieldSchema.push(...convertPlainObjectToFieldSchema(value[0], `${fullKey}[]`));
            } else {
                // Array of primitives or datetime
                const type = _.isString(value[0]) && dayjs(value[0]).isValid()
                    ? 'datetime'
                    : typeof value[0];
                fieldSchema.push({ key: fullKey, type, list: true });
            }
        } else if (_.isPlainObject(value)) {
            // For nested objects, recursively process fields
            fieldSchema.push(...convertPlainObjectToFieldSchema(value, `${fullKey}__`));
        } else {
            // Any other object, null and possibly undefined.
            fieldSchema.push({ key: fullKey });
        }
    });

    return fieldSchema;
};

module.exports = {
    convertPlainObjectToFieldSchema,
};
