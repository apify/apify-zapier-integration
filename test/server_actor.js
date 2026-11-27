/* eslint-env mocha */
const { expect } = require('chai');
const FieldSchema = require('zapier-platform-schema/lib/schemas/PlainInputFieldSchema');
const makeValidator = require('zapier-platform-schema/lib/utils/makeValidator');

const {
    decodeResponseBody,
    escapeMarkdown,
    getEndpointEntries,
    getEndpointInputFields,
    getErrorFromBody,
    getServerActorOrigin,
    parseActorReference,
    parseEndpointValue,
    parseOpenApiDocument,
    parseOpenApiEndpoints,
    resolveRefs,
} = require('../src/server_actor');
const { ITEMS_OPENAPI, WEB_FETCH_OPENAPI } = require('./helpers/server_actor');

const validator = makeValidator(FieldSchema);

const expectValidFields = (fields) => fields.forEach((field) => {
    const { errors } = validator.validate(field);
    expect(errors, `${field.key}: ${errors.map(String).join(', ')}`).to.have.lengthOf(0);
});

const byKey = (fields) => Object.fromEntries(fields.map((field) => [field.key, field]));
const getKeys = (fields) => fields.map(({ key }) => key);

describe('server actor', () => {
    describe('parseOpenApiDocument', () => {
        it('takes webServerSchema as an object or as a JSON string', () => {
            expect(parseOpenApiDocument(WEB_FETCH_OPENAPI)).to.equal(WEB_FETCH_OPENAPI);
            expect(parseOpenApiDocument(JSON.stringify(WEB_FETCH_OPENAPI))).to.eql(WEB_FETCH_OPENAPI);
        });

        it('returns undefined for anything that is not a JSON object', () => {
            [undefined, null, '', 'not json', '[1, 2]', 42, ['a']].forEach((value) => {
                expect(parseOpenApiDocument(value)).to.equal(undefined);
            });
        });
    });

    describe('parseOpenApiEndpoints', () => {
        it('lists Web Fetch\'s endpoints with their summaries', () => {
            expect(parseOpenApiEndpoints(WEB_FETCH_OPENAPI)).to.eql([
                { value: 'GET /', label: 'GET / - Fetch a URL', method: 'GET', path: '/' },
                { value: 'POST /', label: 'POST / - Fetch a URL', method: 'POST', path: '/' },
            ]);
        });

        it('hides utility paths and labels an endpoint by the first line of its description', () => {
            expect(parseOpenApiEndpoints(ITEMS_OPENAPI).map(({ label }) => label)).to.eql([
                'POST /items/{itemId} - Update an item',
                'GET /items/{itemId}/notes/{noteId} - Get a note.',
                'POST /batch - Create items in a batch',
            ]);
        });

        it('cuts a long summary', () => {
            const document = { paths: { '/': { get: { summary: 'x'.repeat(200) } } } };
            const [{ label }] = parseOpenApiEndpoints(document);
            expect(label).to.have.lengthOf('GET / - '.length + 80);
            expect(label.endsWith('…')).to.equal(true);
        });

        it('returns no endpoints without paths', () => {
            expect(parseOpenApiEndpoints(undefined)).to.eql([]);
            expect(parseOpenApiEndpoints({ openapi: '3.0.0' })).to.eql([]);
        });

        it('lists and loads the operations of a path item that references a shared one, and those next to the $ref', () => {
            const query = (name) => [{ name, in: 'query', schema: { type: 'string' } }];
            const document = {
                paths: {
                    '/shared': { $ref: '#/components/pathItems/Shared' },
                    '/mixed': { $ref: '#/components/pathItems/Shared', post: { summary: 'Own POST', parameters: query('own') } },
                },
                components: { pathItems: { Shared: { get: { summary: 'Shared GET', parameters: query('q') } } } },
            };

            expect(parseOpenApiEndpoints(document).map(({ value }) => value)).to.eql(['GET /shared', 'GET /mixed', 'POST /mixed']);
            expect(getKeys(getEndpointInputFields(document, 'GET', '/shared'))).to.eql(['query_q']);
            expect(getKeys(getEndpointInputFields(document, 'GET', '/mixed'))).to.eql(['query_q']);
            expect(getKeys(getEndpointInputFields(document, 'POST', '/mixed'))).to.eql(['query_own']);
        });
    });

    describe('parseEndpointValue', () => {
        it('splits a value into the method and path', () => {
            expect(parseEndpointValue('POST /items/{itemId}')).to.eql({ method: 'POST', path: '/items/{itemId}' });
        });

        it('rejects anything else', () => {
            ['', 'GET', 'get /', 'HEAD /', 'GET items', 'GET / x', '__custom__'].forEach((value) => {
                expect(parseEndpointValue(value), value).to.equal(undefined);
            });
        });
    });

    describe('resolveRefs', () => {
        it('resolves a pointer into a property of another schema', () => {
            const schema = resolveRefs(WEB_FETCH_OPENAPI, { $ref: '#/components/schemas/FetchRequest/properties/url' });
            expect(schema.type).to.equal('string');
        });

        it('follows a chain of refs, and stops after 10', () => {
            const schemas = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`S${i}`, { $ref: `#/components/schemas/S${i + 1}` }]));
            schemas.S12 = { type: 'string' };
            const document = { components: { schemas } };
            expect(resolveRefs(document, { $ref: '#/components/schemas/S3' })).to.eql({ type: 'string' });
            expect(resolveRefs(document, { $ref: '#/components/schemas/S0' })).to.eql({});
        });

        it('cuts a cycle to the target\'s own keywords, and turns a missing target and a remote ref into {}', () => {
            const document = {
                components: {
                    schemas: {
                        Node: { type: 'object', description: 'A tree node.', properties: { child: { $ref: '#/components/schemas/Node' } } },
                    },
                },
            };
            const node = resolveRefs(document, { $ref: '#/components/schemas/Node' });
            expect(node.properties.child).to.eql({ type: 'object', description: 'A tree node.' });
            expect(resolveRefs(document, { $ref: '#/components/schemas/Missing' })).to.eql({});
            expect(resolveRefs(document, { $ref: 'https://example.com/schema.json' })).to.eql({});
            expect(resolveRefs(document, { $ref: '#/components/%E0%A4%A' })).to.eql({});
        });

        it('keeps the type of a schema that a cycle cut short, also where the cached copy is used again', () => {
            // Filter and Req reference each other. Resolved through the query parameter first, the cached Req has its
            // `f` cut; the body then reuses that copy, and `f` must still be an object.
            const schemas = {
                Filter: { type: 'object', properties: { req: { $ref: '#/components/schemas/Req' } } },
                Req: { type: 'object', properties: { f: { $ref: '#/components/schemas/Filter' } } },
            };
            const document = {
                components: { schemas },
                paths: {
                    '/': {
                        post: {
                            parameters: [{ name: 'filter', in: 'query', schema: { $ref: '#/components/schemas/Filter' } }],
                            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Req' } } } },
                        },
                    },
                },
            };

            const fieldsByKey = byKey(getEndpointInputFields(document, 'POST', '/'));
            expect(fieldsByKey.body_f).to.include({ type: 'text', helpText: 'Enter a JSON object.' });
            expect(fieldsByKey.query_filter).to.include({ type: 'text', helpText: 'Enter a JSON object.' });
        });

        it('resolves a document whose schemas fan out exponentially in linear time', () => {
            // Each schema references the next one 10 times. Expanded without a cache, that is 10^30 nodes.
            const schemas = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`S${i}`, {
                type: 'object',
                properties: Object.fromEntries(Array.from({ length: 10 }, (__, j) => [`p${j}`, { $ref: `#/components/schemas/S${i + 1}` }])),
            }]));
            schemas.S30 = { type: 'string' };
            const document = {
                components: { schemas },
                paths: { '/': { post: { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/S0' } } } } } } },
            };

            const startedAt = Date.now();
            const fields = getEndpointInputFields(document, 'POST', '/');
            expect(Date.now() - startedAt).to.be.below(1000);
            expect(fields.map(({ key }) => key)).to.eql(Array.from({ length: 10 }, (_, j) => `body_p${j}`));
        });
    });

    describe('getEndpointInputFields', () => {
        it('turns Web Fetch\'s GET / into typed query fields', () => {
            const fields = getEndpointInputFields(WEB_FETCH_OPENAPI, 'GET', '/');
            expectValidFields(fields);
            const fieldsByKey = byKey(fields);

            expect(Object.keys(fieldsByKey)).to.eql(['query_url', 'query_formats', 'query_unwrap', 'query_headers', 'query_wait']);
            expect(fieldsByKey.query_url).to.include({ type: 'string', required: true, placeholder: 'https://apify.com' });
            expect(fieldsByKey.query_formats).to.include({ type: 'string', list: true, required: false });
            expect(fieldsByKey.query_formats.choices).to.eql(['markdown', 'html', 'text', 'links', 'raw']);
            expect(fieldsByKey.query_unwrap).to.include({ type: 'boolean' });
            // A text field: Zapier would turn invalid input in an `integer` field into 0 before `perform` sees it.
            expect(fieldsByKey.query_wait).to.include({ type: 'string' });
            expect(fieldsByKey.query_wait.helpText.endsWith(' Enter a whole number.')).to.equal(true);
            // The choices already say what to enter.
            expect(fieldsByKey.query_formats.helpText).to.not.include('Enter');
        });

        it('turns Web Fetch\'s POST / body into one field per property', () => {
            const fields = getEndpointInputFields(WEB_FETCH_OPENAPI, 'POST', '/');
            expectValidFields(fields);
            const fieldsByKey = byKey(fields);

            expect(Object.keys(fieldsByKey)).to.eql(['body_url', 'body_formats', 'body_unwrap', 'body_headers', 'body_wait']);
            expect(fieldsByKey.body_url.required).to.equal(true);
            expect(fieldsByKey.body_formats.required).to.equal(false);
            // An object with only additionalProperties is edited as key-value pairs.
            expect(fieldsByKey.body_headers).to.include({ dict: true });
        });

        it('merges path-level and operation-level parameters, the operation\'s winning', () => {
            const fieldsByKey = byKey(getEndpointInputFields(ITEMS_OPENAPI, 'POST', '/items/{itemId}'));
            expect(fieldsByKey.query_limit.helpText).to.equal('Operation-level limit. Enter a whole number.');
            expect(fieldsByKey.query_limit.placeholder).to.equal('20');
            expect(fieldsByKey.path_itemId.required).to.equal(true);
        });

        it('adds a required field for a path placeholder that no parameter declares', () => {
            const fields = getEndpointInputFields(ITEMS_OPENAPI, 'GET', '/items/{itemId}/notes/{noteId}');
            expectValidFields(fields);
            expect(fields.map(({ key, required }) => [key, required])).to.eql([['path_noteId', true], ['path_itemId', true]]);
        });

        it('reads a +json body behind a $ref and types its properties', () => {
            const fields = getEndpointInputFields(ITEMS_OPENAPI, 'POST', '/items/{itemId}');
            expectValidFields(fields);
            const fieldsByKey = byKey(fields);

            expect(fieldsByKey.body_name).to.include({ type: 'string', required: true, placeholder: 'Lamp' });
            expect(fieldsByKey.body_count).to.include({ type: 'string', required: false, helpText: 'Enter a whole number.' });
            expect(fieldsByKey.body_ratio).to.include({ type: 'string', helpText: 'Enter a number.' });
            expect(fieldsByKey.body_active).to.include({ type: 'boolean', placeholder: 'true' });
            // pydantic's Optional[str] is a string, and a null default isn't shown.
            expect(fieldsByKey.body_note).to.include({ type: 'string' });
            expect(fieldsByKey.body_note).to.not.have.property('placeholder');
            expect(fieldsByKey.body_ids).to.include({ type: 'string', list: true, helpText: 'Enter whole numbers.' });
            expect(fieldsByKey.body_labels).to.include({ dict: true });
            expect(fieldsByKey.body_labels).to.not.have.property('helpText');
            expect(fieldsByKey.body_weights).to.include({ dict: true, helpText: 'Enter numbers as the values.' });
            expect(fieldsByKey.body_meta).to.include({ type: 'text', helpText: 'Enter a JSON object.' });
            expect(fieldsByKey.query_mode.choices).to.eql(['fast', 'full']);
        });

        it('edits an object of objects or arrays as JSON, since key-value pairs only hold text', () => {
            const document = {
                paths: {
                    '/': {
                        post: {
                            requestBody: {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                groups: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
                                                any: { type: 'object', additionalProperties: true },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const fieldsByKey = byKey(getEndpointInputFields(document, 'POST', '/'));
            expect(fieldsByKey.body_groups).to.include({ type: 'text', helpText: 'Enter a JSON object.' });
            expect(fieldsByKey.body_any).to.include({ dict: true });
        });

        it('turns parameter and property names into readable labels, and keeps the names as the keys', () => {
            const query = (name, schema = { type: 'string' }) => ({ name, in: 'query', schema });
            const document = {
                paths: {
                    '/{userId}': {
                        post: {
                            parameters: [
                                query('includeAboutSection', { type: 'boolean' }),
                                query('url'),
                                query('max_results', { type: 'integer' }),
                                query('HTMLContent'),
                                query('start-urls', { type: 'array', items: { type: 'string' } }),
                                query('q'),
                            ],
                            requestBody: { content: { 'application/json': { schema: { properties: { apiKeyID: { type: 'string' } } } } } },
                        },
                    },
                },
            };

            const fields = getEndpointInputFields(document, 'POST', '/{userId}');
            expectValidFields(fields);
            expect(fields.map(({ key, label }) => [key, label])).to.eql([
                ['path_userId', 'User ID'],
                ['query_includeAboutSection', 'Include about section'],
                ['query_url', 'URL'],
                ['query_max_results', 'Max results'],
                ['query_HTMLContent', 'HTML content'],
                ['query_start-urls', 'Start URLs'],
                ['query_q', 'Q'],
                ['body_apiKeyID', 'API key ID'],
            ]);
        });

        it('adds the location to the label of a query parameter and a body property with the same name', () => {
            const fieldsByKey = byKey(getEndpointInputFields(ITEMS_OPENAPI, 'POST', '/items/{itemId}'));
            expect(fieldsByKey.query_limit.label).to.equal('Limit (query)');
            expect(fieldsByKey.body_limit.label).to.equal('Limit (body)');
            expect(fieldsByKey.body_count.label).to.equal('Count');
        });

        it('adds the name to the labels of two parameters whose names read the same', () => {
            const document = {
                paths: {
                    '/': {
                        get: {
                            parameters: [
                                { name: 'user_id', in: 'query', schema: { type: 'string' } },
                                { name: 'userId', in: 'query', schema: { type: 'string' } },
                            ],
                        },
                    },
                },
            };
            expect(getEndpointInputFields(document, 'GET', '/').map(({ label }) => label)).to.eql(['User ID (user_id)', 'User ID (userId)']);
        });

        it('marks the required properties of an optional body as optional fields', () => {
            const getRequired = (requestBodyRequired) => {
                const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' }, note: { type: 'string' } } };
                const requestBody = { required: requestBodyRequired, content: { 'application/json': { schema } } };
                const document = { paths: { '/': { post: { requestBody } } } };
                return getEndpointInputFields(document, 'POST', '/').map(({ key, required }) => [key, required]);
            };

            expect(getRequired(true)).to.eql([['body_name', true], ['body_note', false]]);
            expect(getRequired(undefined)).to.eql([['body_name', false], ['body_note', false]]);
        });

        it('gives a body that is not an object with properties a single JSON field', () => {
            const fields = getEndpointInputFields(ITEMS_OPENAPI, 'POST', '/batch');
            expectValidFields(fields);
            expect(fields).to.eql([{ key: 'bodyJson', label: 'Body (JSON)', required: false, type: 'text', helpText: 'Enter a JSON array.' }]);
        });

        it('never puts an OpenAPI default into the Zapier default', () => {
            [
                getEndpointInputFields(WEB_FETCH_OPENAPI, 'GET', '/'),
                getEndpointInputFields(WEB_FETCH_OPENAPI, 'POST', '/'),
                getEndpointInputFields(ITEMS_OPENAPI, 'POST', '/items/{itemId}'),
            ].flat().forEach((field) => expect(field, field.key).to.not.have.property('default'));
        });

        it('escapes the Actor\'s Markdown in help texts and keeps them within 1000 characters', () => {
            const fieldsByKey = byKey(getEndpointInputFields(ITEMS_OPENAPI, 'POST', '/items/{itemId}'));
            expect(fieldsByKey.body_name.helpText).to.equal('The item\'s \\[name\\]\\(https://example.com\\) with \\*emphasis\\*.');

            // Backticks are escaped too. Renderers pair backtick runs in their own way (run lengths, table cells), so
            // text left alone as inline code could end up outside a code span, as a link.
            expect(escapeMarkdown('Use `snake_case` keys, not [links](https://x.y).'))
                .to.equal('Use \\`snake\\_case\\` keys, not \\[links\\]\\(https://x.y\\).');
            expect(escapeMarkdown('`` ` ``[Reconnect your account](https://evil.example)`'))
                .to.equal('\\`\\` \\` \\`\\`\\[Reconnect your account\\]\\(https://evil.example\\)\\`');

            const document = {
                paths: {
                    '/': {
                        get: {
                            parameters: [
                                { name: 'long', in: 'query', description: '_'.repeat(900), schema: { type: 'string' } },
                                { name: 'json', in: 'query', description: 'x'.repeat(2000), schema: { type: 'object' } },
                            ],
                        },
                    },
                },
            };
            const fields = getEndpointInputFields(document, 'GET', '/');
            expectValidFields(fields);
            const [longField, jsonField] = fields;
            expect(longField.helpText.length).to.be.within(999, 1000);
            // Every underscore stays escaped: the cut doesn't leave a lone backslash.
            expect(longField.helpText).to.match(/^(\\_)+…$/);
            expect(jsonField.helpText).to.have.lengthOf(1000);
            expect(jsonField.helpText.endsWith('… Enter a JSON object.')).to.equal(true);
        });

        it('returns undefined for an endpoint that is not in the document', () => {
            expect(getEndpointInputFields(WEB_FETCH_OPENAPI, 'DELETE', '/')).to.equal(undefined);
            expect(getEndpointInputFields(undefined, 'GET', '/')).to.equal(undefined);
        });

        it('builds the field keys and the request targets from the same entries', () => {
            const entries = getEndpointEntries(ITEMS_OPENAPI, 'POST', '/items/{itemId}');
            const fields = getEndpointInputFields(ITEMS_OPENAPI, 'POST', '/items/{itemId}');
            expect(entries.map(({ key }) => key)).to.eql(fields.map(({ key }) => key));
            expect(entries.find(({ key }) => key === 'query_tags')).to.include({ location: 'query', name: 'tags', explode: true });
        });
    });

    describe('decodeResponseBody', () => {
        it('parses JSON, also without a content type and for +json types', () => {
            expect(decodeResponseBody(Buffer.from('{"a":1}'), 'application/json')).to.eql({ body: { a: 1 } });
            expect(decodeResponseBody(Buffer.from('[1]'), 'application/problem+json')).to.eql({ body: [1] });
            expect(decodeResponseBody(Buffer.from('{"a":1}'), '')).to.eql({ body: { a: 1 } });
        });

        it('keeps other text, and JSON that does not parse, as a string', () => {
            expect(decodeResponseBody(Buffer.from('<p>Hi</p>'), 'text/html')).to.eql({ body: '<p>Hi</p>' });
            expect(decodeResponseBody(Buffer.from('{"a":'), 'application/json')).to.eql({ body: '{"a":' });
            expect(decodeResponseBody(Buffer.from('{"a":1}\n{"a":2}\n'), 'application/x-ndjson')).to.eql({ body: '{"a":1}\n{"a":2}\n' });
        });

        it('returns null for an empty body', () => {
            expect(decodeResponseBody(Buffer.alloc(0), 'application/json')).to.eql({ body: null });
        });

        it('detects binary data by content type, and by invalid UTF-8', () => {
            expect(decodeResponseBody(Buffer.from('PNG'), 'image/png')).to.eql({ binary: true });
            expect(decodeResponseBody(Buffer.from('%PDF'), 'application/pdf')).to.eql({ binary: true });
            expect(decodeResponseBody(Buffer.from([0xff, 0xfe, 0x00]), '')).to.eql({ binary: true });
            expect(decodeResponseBody(Buffer.from([0xc3, 0x28]), 'text/plain')).to.eql({ binary: true });
        });
    });

    describe('getErrorFromBody', () => {
        it('reads Apify\'s nested error, a flat error and code, and other common shapes', () => {
            expect(getErrorFromBody({ error: { type: 'record-not-found', message: 'Not found' } }))
                .to.eql({ message: 'Not found', type: 'record-not-found' });
            expect(getErrorFromBody({ error: 'URL is required', code: 'INVALID_INPUT' })).to.eql({ message: 'URL is required', type: 'INVALID_INPUT' });
            expect(getErrorFromBody({ detail: 'Validation failed' })).to.eql({ message: 'Validation failed', type: undefined });
            expect(getErrorFromBody({ title: 'Bad Request', type: 'about:blank' })).to.eql({ message: 'Bad Request', type: 'about:blank' });
        });

        it('takes only the title of an HTML error page', () => {
            const page = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>\n  Page not found &amp; gone &#8211; Apify\n</title>'
                + '<script src="/_next/static/chunks/main.js"></script></head><body>404</body></html>';
            expect(getErrorFromBody(page, 'text/html')).to.eql({ message: 'Page not found & gone – Apify' });
            // Recognized by its start too, when the Actor sends no HTML content type.
            expect(getErrorFromBody(page, '')).to.eql({ message: 'Page not found & gone – Apify' });
            expect(getErrorFromBody('<html><body><script>x()</script></body></html>', 'text/html')).to.eql({ message: undefined });
            // Plain text that mentions HTML stays as it is.
            expect(getErrorFromBody('Expected <html> input', 'text/plain')).to.eql({ message: 'Expected <html> input' });
        });

        it('takes a text body as the message, cut to 1000 characters', () => {
            expect(getErrorFromBody('  Gateway Timeout  ')).to.eql({ message: 'Gateway Timeout' });
            expect(getErrorFromBody('x'.repeat(5000)).message).to.have.lengthOf(1000);
            expect(getErrorFromBody(null)).to.eql({});
            expect(getErrorFromBody(['a'])).to.eql({});
        });
    });

    describe('parseActorReference', () => {
        it('takes an ID or a name as it is, trimmed', () => {
            expect(parseActorReference(' a6Sqhlnt4touIHTub ')).to.equal('a6Sqhlnt4touIHTub');
            expect(parseActorReference('apify~web-fetch')).to.equal('apify~web-fetch');
            expect(parseActorReference('')).to.equal('');
            expect(parseActorReference(undefined)).to.equal('');
        });

        it('turns username/name into username~name, so it stays one segment of the API URL path', () => {
            expect(parseActorReference('apify/web-fetch')).to.equal('apify~web-fetch');
        });

        it('rejects values that are not an ID or name, as they go into the API URL path', () => {
            // URLs resolve "." and ".." as dot segments: /v2/acts/.. would be /v2/.
            [
                '.',
                '..',
                ' .. ',
                'apify/web-fetch/x',
                '/web-fetch',
                'apify web-fetch',
                'apify~web-fetch?x=1',
                '%2e%2e',
                'https://apify.com/apify/web-fetch%3F',
                'https://console.apify.com/actors/a%2Fb',
            ].forEach((value) => expect(parseActorReference(value), value).to.equal(undefined));
        });

        it('reads Apify Store and Console URLs', () => {
            expect(parseActorReference('https://apify.com/apify/web-fetch')).to.equal('apify~web-fetch');
            expect(parseActorReference('https://www.apify.com/apify/web-fetch/input-schema?fpr=abc')).to.equal('apify~web-fetch');
            expect(parseActorReference('https://console.apify.com/actors/a6Sqhlnt4touIHTub/information/latest/readme'))
                .to.equal('a6Sqhlnt4touIHTub');
        });

        it('rejects other URLs', () => {
            [
                'https://example.com/apify/web-fetch',
                'https://apify.com/apify',
                'https://console.apify.com/actors/tasks/abc',
                'https://web-fetch.apify.actor/',
                'https://',
            ].forEach((value) => expect(parseActorReference(value), value).to.equal(undefined));
        });
    });

    describe('getServerActorOrigin', () => {
        it('returns the origin of an https *.apify.actor standby URL', () => {
            expect(getServerActorOrigin({ actorStandby: { isEnabled: true }, standbyUrl: 'https://web-fetch.apify.actor/' }))
                .to.equal('https://web-fetch.apify.actor');
        });

        it('rejects an Actor without a server interface, or with a URL that would take the token elsewhere', () => {
            [
                { standbyUrl: 'https://web-fetch.apify.actor' },
                { actorStandby: { isEnabled: false }, standbyUrl: 'https://web-fetch.apify.actor' },
                { actorStandby: { isEnabled: true } },
                { actorStandby: { isEnabled: true }, standbyUrl: 'http://web-fetch.apify.actor' },
                { actorStandby: { isEnabled: true }, standbyUrl: 'https://web-fetch.apify.actor.example.com' },
                { actorStandby: { isEnabled: true }, standbyUrl: 'https://example.com' },
                { actorStandby: { isEnabled: true }, standbyUrl: 'not a url' },
            ].forEach((actor) => expect(getServerActorOrigin(actor), JSON.stringify(actor)).to.equal(undefined));
        });
    });
});
