/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { WEBHOOK_EVENT_TYPE_GROUPS, ACTOR_JOB_TERMINAL_STATUSES } = require('@apify/consts');
const _ = require('lodash');
const { TASK_RUN_SAMPLE } = require('../../src/consts');
const {
    randomString, apifyClient, createWebScraperTask,
    TEST_USER_TOKEN, createLegacyCrawlerTask, getMockWebhookResponse, getMockTaskRun,
    mockDatasetPublicUrl,
} = require('../helpers');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('task run finished trigger', () => {
    const testedResult = { testedField: 'testValue', url: 'https://apify.com' };
    let testTaskId = randomString();
    let legacyCrawlerTaskId = randomString();
    let subscribeData;

    before(async function () {
        if (TEST_USER_TOKEN) {
            this.timeout(120000);
            // Create task for testing
            const task = await createWebScraperTask();
            testTaskId = task.id;
            const legacyCrawlerTask = await createLegacyCrawlerTask(`function pageFunction(context) { return ${JSON.stringify(testedResult)} }`);
            legacyCrawlerTaskId = legacyCrawlerTask.id;
        }
    });

    after(async () => {
        if (TEST_USER_TOKEN) {
            await apifyClient.task(testTaskId).delete();
            await apifyClient.task(legacyCrawlerTaskId).delete();
        }
    });

    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    it('subscribe webhook work', async () => {
        const requestUrl = `http://example.com/#${randomString()}`;
        const bundle = {
            targetUrl: requestUrl,
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
            },
            meta: {},
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .post('/v2/webhooks', (payload) => {
                    expect(payload).to.have.property('requestUrl', requestUrl);
                    expect(payload).to.have.property('eventTypes')
                        .that.includes.members(WEBHOOK_EVENT_TYPE_GROUPS.ACTOR_RUN_TERMINAL);
                    expect(payload).to.have.property('condition').that.has.property('actorTaskId', testTaskId);
                    return true;
                })
                .reply(200, getMockWebhookResponse());
        }

        subscribeData = await appTester(App.triggers.taskRunFinished.operation.performSubscribe, bundle);

        if (TEST_USER_TOKEN) {
            // Check if webhook is set
            const taskWebhooks = await apifyClient.task(testTaskId).webhooks().list();

            expect(taskWebhooks.items.length).to.be.eql(1);
            expect(taskWebhooks.items[0].requestUrl).to.be.eql(requestUrl);
            expect(taskWebhooks.items[0].eventTypes)
                .to.include.members(['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'])
                .but.not.include.members(['ACTOR.RUN.CREATED']);
        } else {
            scope.done();
        }
    }).timeout(120000);

    it('unsubscribe webhook work', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            subscribeData,
            meta: {},
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .delete(`/v2/webhooks/${subscribeData.id}`)
                .reply(204);
        }

        await appTester(App.triggers.taskRunFinished.operation.performUnsubscribe, bundle);

        if (TEST_USER_TOKEN) {
            // Check if webhook is not set
            const taskWebhooks = await apifyClient.task(testTaskId).webhooks().list();

            expect(taskWebhooks.items.length).to.be.eql(0);
        } else {
            scope.done();
        }
    });

    it('perform should return task run detail', async () => {
        const runId = randomString();
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
            },
            cleanedRequest: { // Mock webhook payload
                resource: {
                    id: runId,
                },
            },
        };

        const results = await appTester(App.triggers.taskRunFinished.operation.perform, bundle);

        expect(results.length).to.be.eql(1);
        expect(results[0].id).to.be.eql(bundle.cleanedRequest.resource.id);
    });

    it('performList should return task runs', async () => {
        const runs = [];

        if (TEST_USER_TOKEN) {
            for (let i = 0; i < 4; i++) {
                const run = await apifyClient.task(testTaskId).call({
                    waitSecs: 120,
                });
                runs.push(run);
            }
        } else {
            runs.push(getMockTaskRun());
            runs.push(getMockTaskRun());
            runs.push(getMockTaskRun());
            runs.push(getMockTaskRun());

            runs.forEach((run) => { delete run.integrationTracking; })
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get(`/v2/actor-tasks/${testTaskId}`)
                .reply(200, {
                    data: {
                        id: testTaskId,
                        userId: 'test-user-id',
                        actId: 'random-actor-id',
                        name: 'test-task-name',
                        username: 'test-username',
                        createdAt: new Date().toISOString(),
                        modifiedAt: new Date().toISOString(),
                    },
                });
            scope.get(`/v2/actor-tasks/${testTaskId}/runs`)
                .query({ limit: 100, desc: true, status: ACTOR_JOB_TERMINAL_STATUSES.join(',') })
                .reply(200, {
                    data: {
                        items: runs.map((run) => {
                            return { id: run.id, status: run.status };
                        }),
                    },
                });

            runs.slice(0, 3).forEach((run) => {
                scope.get(`/v2/acts/random-actor-id/runs/${run.id}`)
                    .query(true)
                    .reply(200, run);

                scope.get(`/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/OUTPUT`)
                    .reply(200, { foo: 'bar' });

                scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
                    .query({ limit: 100, clean: true })
                    .reply(200, [{ foo: 'bar' }]);
                scope.get(`/v2/datasets/${run.defaultDatasetId}`)
                    .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));
            });
        }

        const results = await appTester(App.triggers.taskRunFinished.operation.performList, bundle);

        expect(results.length).to.be.eql(3);
        expect(results.every((item) => runs.some((run) => run.id === item.id))).to.eql(true);
        // eslint-disable-next-line max-len
        expect(results[0]).to.have.all.keys(Object.keys(_.omit(TASK_RUN_SAMPLE, 'integrationTracking')).concat(['isStatusMessageTerminal', 'statusMessage']));
        expect(results[0].OUTPUT).to.not.equal(null);
        expect(results[0].datasetItems.length).to.be.at.least(1);
        expect(results[0].datasetItemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx');

        scope?.done();
    }).timeout(360000);

    // No need to run this test with mocks, it would just end up being a copy of the previous one
    if (TEST_USER_TOKEN) {
        it('performList should return task runs (legacy crawler)', async () => {
            // Create on task run
            const taskRun = await apifyClient.task(legacyCrawlerTaskId).call({
                waitSecs: 120,
            });

            const bundle = {
                authData: {
                    access_token: TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: legacyCrawlerTaskId,
                },
            };

            const results = await appTester(App.triggers.taskRunFinished.operation.performList, bundle);

            expect(results.length).to.be.eql(1);
            expect(results[0].id).to.be.eql(taskRun.id);
            expect(results[0]).to.have.all.keys(Object.keys(_.omit(TASK_RUN_SAMPLE, 'integrationTracking')));
            expect(results[0].datasetItems.length).to.be.at.least(1);
            expect(results[0].datasetItems[0]).to.be.eql(testedResult);
            expect(results[0].datasetItemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx');
        }).timeout(120000);
    }

    describe('tasks hidden trigger', () => {
        afterEach(async () => {
            if (!TEST_USER_TOKEN) {
                nock.cleanAll();
            }
        });

        it('work', async () => {
            const bundle = {
                authData: {
                    access_token: TEST_USER_TOKEN,
                },
                inputData: {},
                meta: {},
            };

            let scope;
            if (!TEST_USER_TOKEN) {
                scope = nock('https://api.apify.com')
                    .get('/v2/actor-tasks')
                    .query({ limit: 500, offset: 0 })
                    .reply(200, {
                        data: {
                            total: 1,
                            offset: 0,
                            limit: 500,
                            desc: false,
                            count: 1,
                            items: [{
                                id: testTaskId,
                                name: 'test-task-name',
                                username: 'test-user-id',
                                createdAt: new Date().toISOString(),
                                modifiedAt: new Date().toISOString(),
                            }],
                        },
                    });
            }

            const taskList = await appTester(App.triggers.tasks.operation.perform, bundle);

            expect(taskList.length).to.be.at.least(1);
            taskList.forEach((task) => expect(task).to.have.all.keys('id', 'name'));

            scope?.done();
        });
    });
});
