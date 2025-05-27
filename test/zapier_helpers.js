/* eslint-env mocha */
const { expect } = require('chai');
const { convertPlainObjectToFieldSchema } = require('../src/zapier_helpers');

describe('zapier helpers', () => {
    it('convertToFieldSchema works', () => {
        const object = {
            a: 'string',
            b: 1,
            c: true,
            d: [1, 2, 3],
            e: { key: 'value', key2: 'value2' },
            f: '2021-01-01T00:00:00Z',
            g: [{ key: 'value', key2: 1 }, { key: 'value' }],
            h: { key: { keyChild: 'value', keyChildArray: [{ key: 'value' }] } },
        };
        const outputFields = convertPlainObjectToFieldSchema(object);
        const expected = [
            { key: 'a', type: 'string' },
            { key: 'b', type: 'number' },
            { key: 'c', type: 'boolean' },
            { key: 'd', type: 'number', list: true },
            { key: 'e__key', type: 'string' },
            { key: 'e__key2', type: 'string' },
            { key: 'f', type: 'datetime' },
            { key: 'g[]key', type: 'string' },
            { key: 'g[]key2', type: 'number' },
            { key: 'h__key__keyChild', type: 'string' },
            { key: 'h__key__keyChildArray[]key', type: 'string' },
        ];
        expect(outputFields).to.be.eql(expected);
    });

    it('convertToFieldSchema works with empty object', () => {
        const object = {};
        convertPlainObjectToFieldSchema(object);
        expect(convertPlainObjectToFieldSchema(object)).to.be.eql([]);
    });

    it('convertToFieldSchema works with null object', () => {
        const object = null;
        convertPlainObjectToFieldSchema(object);
        expect(convertPlainObjectToFieldSchema(object)).to.be.eql([]);
    });
});
