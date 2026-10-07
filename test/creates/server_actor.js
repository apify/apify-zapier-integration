/* eslint-env mocha */
// SPIKE: "Endpoint" interface of the Run Actor action (Server Actors). Mocked only (nock).
const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');
const FieldSchema = require('zapier-platform-schema/lib/schemas/PlainInputFieldSchema');
const makeValidator = require('zapier-platform-schema/lib/utils/makeValidator');

const App = require('../../index');
const { parseOpenApiEndpoints, resolveRef } = require('../../src/server_actor');
const { getMockActorDetails } = require('../helpers');

chai.use(chaiAsPromised);
const { expect } = chai;
const appTester = zapier.createAppTester(App);
const validator = makeValidator(FieldSchema);
const TOKEN = 'test-token';

const OPENAPI = {
    openapi: '3.0.0',
    paths: {
        '/': {
            get: {
                summary: 'Fetch a URL',
                parameters: [
                    { name: 'url', in: 'query', required: true, schema: { $ref: '#/components/schemas/Req/properties/url' } },
                    { name: 'formats', in: 'query', explode: false, schema: { $ref: '#/components/schemas/Req/properties/formats' } },
                    { name: 'wait', in: 'query', schema: { type: 'integer', default: 5 } },
                ],
            },
            post: {
                summary: 'Fetch a URL (body)',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Req' } } } },
            },
        },
        '/items/{itemId}': {
            parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }],
            delete: { summary: 'Delete item' },
        },
        '/health': { get: { summary: 'Health' } },
    },
    components: {
        schemas: {
            Req: {
                type: 'object',
                required: ['url'],
                properties: {
                    url: { type: 'string', description: 'The URL to fetch.' },
                    formats: { type: 'array', items: { type: 'string', enum: ['markdown', 'html'] } },
                    unwrap: { type: 'boolean' },
                    headers: { type: 'object', additionalProperties: { type: 'string' } },
                    options: { type: 'object', properties: { a: { type: 'string' } } },
                },
            },
        },
    },
};

const mockActor = (actorId, { standby, definition } = {}) => {
    const actor = getMockActorDetails({
        id: actorId,
        actorStandby: { isEnabled: Boolean(standby) },
        standbyUrl: standby ? 'https://test-actor.apify.actor' : undefined,
    });
    const scope = nock('https://api.apify.com').get(`/v2/acts/${actorId}`).reply(200, { data: actor });
    if (standby) scope.get(`/v2/acts/${actorId}/builds/default`).reply(200, { data: { actorDefinition: definition || {} } });
    return actor;
};

const resolveFields = (inputData) => appTester(App.creates.createActorRun.operation.inputFields, {
    authData: { access_token: TOKEN },
    inputData,
});

const keys = (fields) => fields.map((f) => f.key);

describe('server actor (Endpoint interface)', () => {
    afterEach(() => nock.cleanAll());

    describe('OpenAPI parsing', () => {
        it('lists endpoints without platform paths', () => {
            const endpoints = parseOpenApiEndpoints(JSON.stringify(OPENAPI));
            expect(endpoints.map((e) => e.value)).to.eql(['GET /', 'POST /', 'DELETE /items/{itemId}']);
            expect(endpoints[0].label).to.eql('GET / - Fetch a URL');
        });

        it('resolves deep local $refs', () => {
            expect(resolveRef(OPENAPI, { $ref: '#/components/schemas/Req/properties/url' }).type).to.eql('string');
        });

        it('returns no endpoints for missing or invalid schema', () => {
            expect(parseOpenApiEndpoints(undefined)).to.eql([]);
            expect(parseOpenApiEndpoints('not json')).to.eql([]);
        });
    });

    describe('input fields', () => {
        it('Input interface (default) shows run fields, no endpoint fields', async () => {
            mockActor('actorA');
            nock('https://api.apify.com').get(/\/v2\/acts\/actorA\/builds\/.+/).reply(200, { data: {} }); // no input schema
            const fields = await resolveFields({ actorId: 'actorA' });
            expect(keys(fields)).to.include.members(['actorInterface', 'runSync', 'build', 'timeoutSecs', 'memoryMbytes']);
            expect(keys(fields)).to.not.include('serverEndpoint');
        });

        it('Endpoint interface hides run fields and lists endpoints', async () => {
            mockActor('actorB', { standby: true, definition: { webServerSchema: OPENAPI } });
            const fields = await resolveFields({ actorId: 'actorB', actorInterface: 'endpoint' });
            expect(keys(fields)).to.not.include.members(['runSync', 'build', 'inputBody']);
            const endpoint = fields.find((f) => f.key === 'serverEndpoint');
            expect(endpoint.altersDynamicFields).to.eql(true);
            expect(endpoint.choices.map((c) => c.value)).to.eql(['GET /', 'POST /', 'DELETE /items/{itemId}', '__custom__']);
        });

        it('selected GET endpoint generates typed query fields', async () => {
            mockActor('actorC', { standby: true, definition: { webServerSchema: OPENAPI } });
            const fields = await resolveFields({ actorId: 'actorC', actorInterface: 'endpoint', serverEndpoint: 'GET /' });
            const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
            expect(byKey.saQuery_url).to.include({ type: 'string', required: true, helpText: 'The URL to fetch.' });
            expect(byKey.saQuery_formats).to.include({ list: true });
            expect(byKey.saQuery_formats.choices).to.eql(['markdown', 'html']);
            expect(byKey.saQuery_wait).to.include({ type: 'integer', default: '5' });
            fields.forEach((field) => expect(validator.validate(field).errors).to.eql([]));
        });

        it('selected POST endpoint generates body fields (dict for maps, JSON text for objects)', async () => {
            mockActor('actorD', { standby: true, definition: { webServerSchema: OPENAPI } });
            const fields = await resolveFields({ actorId: 'actorD', actorInterface: 'endpoint', serverEndpoint: 'POST /' });
            const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
            expect(byKey.saBody_url.required).to.eql(true);
            expect(byKey.saBody_unwrap.type).to.eql('boolean');
            expect(byKey.saBody_headers.dict).to.eql(true);
            expect(byKey.saBody_options.type).to.eql('text');
            fields.forEach((field) => expect(validator.validate(field).errors).to.eql([]));
        });

        it('an endpoint from a previously selected Actor is ignored', async () => {
            mockActor('actorE', { standby: true, definition: { webServerSchema: OPENAPI } });
            const fields = await resolveFields({
                actorId: 'actorE', actorInterface: 'endpoint', serverEndpoint: 'GET /', serverEndpointActorId: 'otherActor',
            });
            expect(keys(fields).filter((k) => k.startsWith('saQuery_'))).to.eql([]);
        });

        it('Actor without server interface shows a copy field, no dropdown', async () => {
            mockActor('actorF');
            const fields = await resolveFields({ actorId: 'actorF', actorInterface: 'endpoint' });
            const copy = fields.find((f) => f.key === 'saNoServerInterface');
            expect(copy.type).to.eql('copy');
            expect(copy.helpText).to.contain('no server interface');
            expect(keys(fields)).to.not.include('serverEndpoint');
        });

        it('MCP-only Actor explains MCP and offers only a custom path', async () => {
            mockActor('actorG', { standby: true, definition: { webServerMcpPath: '/mcp' } });
            const fields = await resolveFields({ actorId: 'actorG', actorInterface: 'endpoint' });
            expect(fields.find((f) => f.key === 'saNoServerInterface').helpText).to.contain('MCP server');
            expect(fields.find((f) => f.key === 'serverEndpoint').choices.map((c) => c.value)).to.eql(['__custom__']);
        });

        it('output fields follow the interface', async () => {
            const endpointFields = await appTester(App.creates.createActorRun.operation.outputFields, {
                authData: { access_token: TOKEN }, inputData: { actorId: 'x', actorInterface: 'endpoint' },
            });
            expect(keys(endpointFields)).to.eql(['status', 'contentType', 'method', 'url', 'body']);
        });
    });

    describe('perform', () => {
        it('calls the endpoint with typed query params and returns status/contentType/body', async () => {
            mockActor('actorH', { standby: true, definition: { webServerSchema: OPENAPI } });
            const server = nock('https://test-actor.apify.actor', { reqheaders: { authorization: `Bearer ${TOKEN}` } })
                .get('/')
                .query({ url: 'https://example.com', formats: 'markdown,html', wait: '3' })
                .reply(200, { markdown: '# Hi' });
            const result = await appTester(App.creates.createActorRun.operation.perform, {
                authData: { access_token: TOKEN },
                inputData: {
                    actorId: 'actorH',
                    actorInterface: 'endpoint',
                    serverEndpoint: 'GET /',
                    saQuery_url: 'https://example.com',
                    saQuery_formats: ['markdown', 'html'],
                    saQuery_wait: 3,
                },
            });
            expect(server.isDone()).to.eql(true);
            expect(result).to.eql({
                status: 200, contentType: 'application/json', method: 'GET', url: 'https://test-actor.apify.actor/', body: { markdown: '# Hi' },
            });
        });

        it('sends a JSON body built from body fields and fills path params', async () => {
            mockActor('actorI', { standby: true, definition: { webServerSchema: OPENAPI } });
            const server = nock('https://test-actor.apify.actor')
                .post('/', { url: 'https://example.com', unwrap: true, headers: { a: 'b' }, options: { a: 'x' } })
                .reply(200, 'plain text', { 'Content-Type': 'text/plain' });
            const result = await appTester(App.creates.createActorRun.operation.perform, {
                authData: { access_token: TOKEN },
                inputData: {
                    actorId: 'actorI',
                    actorInterface: 'endpoint',
                    serverEndpoint: 'POST /',
                    saBody_url: 'https://example.com',
                    saBody_unwrap: true,
                    saBody_headers: { a: 'b' },
                    saBody_options: '{"a":"x"}',
                },
            });
            expect(server.isDone()).to.eql(true);
            expect(result.body).to.eql('plain text');
            expect(result.contentType).to.eql('text/plain');
        });

        it('surfaces the Actor\'s own error message (no retries, no generic message)', async () => {
            mockActor('actorJ', { standby: true, definition: { webServerSchema: OPENAPI } });
            nock('https://test-actor.apify.actor')
                .delete('/items/42')
                .reply(500, { code: 'BOOM', error: 'Something broke' });
            await expect(appTester(App.creates.createActorRun.operation.perform, {
                authData: { access_token: TOKEN },
                inputData: { actorId: 'actorJ', actorInterface: 'endpoint', serverEndpoint: 'DELETE /items/{itemId}', saPath_itemId: '42' },
            })).to.be.rejectedWith(/Something broke \(code: BOOM\)/);
        });

        it('fails clearly when the Actor has no server interface', async () => {
            mockActor('actorK');
            await expect(appTester(App.creates.createActorRun.operation.perform, {
                authData: { access_token: TOKEN },
                inputData: { actorId: 'actorK', actorInterface: 'endpoint', serverEndpoint: 'GET /' },
            })).to.be.rejectedWith(/no server interface/);
        });
    });
});
