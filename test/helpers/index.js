const { ApifyClient } = require('apify-client');
const zapier = require('zapier-platform-core');
const { WEBHOOK_EVENT_TYPE_GROUPS, ACTOR_JOB_STATUSES } = require('@apify/consts');

const DEFAULT_PAGE_FUNCTION = `
async function pageFunction({ request, setValue }) {
    await setValue('OUTPUT', { test: 'foo bar' });
    return { url: request.url };
}
`;

const randomString = () => Math.random().toString(32).split('.')[1];

// Injects all secrets from .env file
// There should be token for running local tests
zapier.tools.env.inject();
const { TEST_USER_TOKEN } = process.env;
const apifyClient = new ApifyClient({ token: TEST_USER_TOKEN });

const createWebScraperTask = async (pageFunction = DEFAULT_PAGE_FUNCTION) => {
    const task = await apifyClient.tasks().create({
        actId: 'apify/web-scraper',
        name: `zapier-test-${randomString()}`,
        options: {
            memoryMbytes: 2048,
        },
        input: {
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
                startUrls: [
                    {
                        url: 'https://apify.com',
                    },
                ],
                useRequestQueue: false,
                pageFunction,
                maxPagesPerCrawl: 1,
            }),
        },
    });
    console.log(`Testing task web-scraper with id ${task.id} created`);
    return task;
};

const createLegacyCrawlerTask = async (pageFunction) => {
    const task = await apifyClient.tasks().create({
        actId: 'apify/legacy-phantomjs-crawler',
        name: `zapier-test-${randomString()}`,
        options: {
            memoryMbytes: 2048,
        },
        input: {
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
                startUrls: [
                    {
                        value: 'https://apify.com',
                    },
                ],
                clickableElementsSelector: '',
                pageFunction,
            }),
        },
    });
    console.log(`Testing task legacy-phantomjs-crawler with id ${task.id} created`);
    return task;
};

const createAndBuildActor = async () => {
    const sourceCode = `
    const Apify = require('apify');
    Apify.main(async (context) => {
        const input = await Apify.getInput();
        console.log('It works.');
        if (input && input.datasetItems) {
            await Apify.pushData(input.datasetItems);
        } else {
            await Apify.pushData({ foo: 'bar' });
        }
        if (input && input.outputRandomFile) {
            await Apify.setValue('OUTPUT', 'blabla', { contentType: 'text/plain' });
        } else {
            await Apify.setValue('OUTPUT', { foo: 'bar' });
        }
    });
    `;
    const actor = await apifyClient.actors().create({
        name: `zapier-test-${randomString()}`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 300,
            memoryMbytes: 512,
        },
        versions: [
            {
                versionNumber: '0.0',
                envVars: [],
                sourceType: 'SOURCE_FILES',
                sourceFiles: [
                    {
                        name: 'main.js',
                        format: 'TEXT',
                        content: sourceCode,
                    },
                    {
                        name: 'package.json',
                        format: 'TEXT',
                        content: `{
                            "name": "apify-project",
                            "version": "0.0.1",
                            "description": "",
                            "author": "It's not you it's me",
                            "license": "ISC",
                            "dependencies": {
                                "apify": "0.22.4"
                            },
                            "scripts": {
                                "start": "node main.js"
                            }
                        }`,
                    },
                    {
                        name: 'Dockerfile',
                        format: 'TEXT',
                        content: `# This is a template for a Dockerfile used to run acts in Actor system.
                        # The base image name below is set during the act build, based on user settings.
                        # IMPORTANT: The base image must set a correct working directory, such as /usr/src/app or /home/user
                        FROM apify/actor-node-basic

                        # Second, copy just package.json and package-lock.json since it should be
                        # the only file that affects "npm install" in the next step, to speed up the build
                        COPY package*.json ./

                        # Install NPM packages, skip optional and development dependencies to
                        # keep the image small. Avoid logging too much and print the dependency
                        # tree for debugging
                        RUN npm --quiet set progress=false \
                         && npm install --only=prod --no-optional \
                         && echo "Installed NPM packages:" \
                         && (npm list --all || true) \
                         && echo "Node.js version:" \
                         && node --version \
                         && echo "NPM version:" \
                         && npm --version

                        # Copy source code to container
                        # Do this in the last step, to have fast build if only the source code changed
                        COPY  . ./

                        # NOTE: The CMD is already defined by the base image.
                        # Uncomment this for local node inspector debugging:
                        # CMD [ "node", "--inspect=0.0.0.0:9229", "main.js" ]
                        `,
                    },
                ],
                buildTag: 'latest',
            },
        ],
    });
    await apifyClient.actor(actor.id).build('0.0', { waitForFinish: 120 });
    console.log(`Testing actor with id ${actor.id} was created and built.`);
    return actor;
};

const getMockRun = (overrides) => {
    return {
        id: randomString(),
        actId: randomString(),
        userId: randomString(),
        startedAt: '2019-11-30T07:34:24.202Z',
        finishedAt: '2019-12-12T09:30:12.202Z',
        status: ACTOR_JOB_STATUSES.SUCCEEDED,
        meta: {
            origin: 'DEVELOPMENT',
        },
        stats: {
            inputBodyLen: 240,
            migrationCount: 0,
            restartCount: 0,
            resurrectCount: 2,
            memAvgBytes: 267874071.9,
            memMaxBytes: 404713472,
            memCurrentBytes: 0,
            cpuAvgUsage: 33.7532101107538,
            cpuMaxUsage: 169.650735534941,
            cpuCurrentUsage: 0,
            netRxBytes: 103508042,
            netTxBytes: 4854600,
            durationMillis: 248472,
            runTimeSecs: 248.472,
            metamorph: 0,
            computeUnits: 0.13804,
        },
        options: {
            build: 'latest',
            timeoutSecs: 300,
            memoryMbytes: 1024,
            diskMbytes: 2048,
        },
        buildId: '7sT5jcggjjA9fNcxF',
        exitCode: 0,
        defaultKeyValueStoreId: randomString(),
        defaultDatasetId: randomString(),
        defaultRequestQueueId: randomString(),
        buildNumber: '0.0.36',
        containerUrl: 'https://g8kd8kbc5ge8.runs.apify.net',
        consoleUrl: 'https://console.apify.com/v2/actor/runs/1',
        generalAccess: false,
        usageTotalUsd: 0.2654,
        usage: {},
        usageUsd: {
            ACTOR_COMPUTE_UNITS: 0.072,
            DATASET_READS: 0.0004,
            DATASET_WRITES: 0.0002,
            KEY_VALUE_STORE_READS: 0.0006,
            KEY_VALUE_STORE_WRITES: 0.002,
            KEY_VALUE_STORE_LISTS: 0.004,
            REQUEST_QUEUE_READS: 0.005,
            REQUEST_QUEUE_WRITES: 0.02,
            DATA_TRANSFER_INTERNAL_GBYTES: 0.0004,
            PROXY_RESIDENTIAL_TRANSFER_GBYTES: 0.16,
            PROXY_SERPS: 0.0006,
        },
        ...overrides,
    };
};

const getMockTaskRun = (overrides) => {
    return getMockRun({
        actorTaskId: randomString(),
        isStatusMessageTerminal: true,
        statusMessage: 'Task Run Finished.',
        ...overrides,
    });
};

const getMockWebhookResponse = (condition, requestUrl, overrides) => {
    return {
        id: randomString(),
        createdAt: '2019-12-12T07:34:14.202Z',
        modifiedAt: '2019-12-13T08:36:13.202Z',
        userId: randomString(),
        isAdHoc: false,
        shouldInterpolateStrings: false,
        eventTypes: WEBHOOK_EVENT_TYPE_GROUPS.ACTOR_RUN_TERMINAL,
        condition,
        ignoreSslErrors: false,
        doNotRetry: false,
        requestUrl,
        payloadTemplate: '{\\n \\"userId\\": {{userId}}...',
        headersTemplate: '{\\n \\"Authorization\\": Bearer...',
        description: 'this is webhook description',
        lastDispatch: {
            status: 'SUCCEEDED',
            finishedAt: '2019-12-13T08:36:13.202Z',
        },
        stats: {
            totalDispatches: 1,
        },
        ...overrides,
    };
};

const getMockActorDetails = (actorFieldsOverrides) => {
    return {
        id: randomString(),
        userId: randomString(),
        name: 'test-actor-name',
        username: 'test-user-name',
        description: 'test-description',
        restartOnError: false,
        isPublic: false,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        stats: {},
        versions: [],
        isDeprecated: false,
        deploymentKey: '',
        title: 'Test Actor',
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 3600,
            memoryMbytes: 512,
        },
        taggedBuilds: {
            latest: {
                buildId: randomString(),
                buildNumber: '0.0.1',
                finishedAt: new Date().toISOString(),
            },
        },
        ...actorFieldsOverrides,
    };
};

const getMockActorBuild = (overrideFields) => {
    return {
        id: randomString(),
        actId: randomString(),
        userId: randomString(),
        buildNumber: '0.0.1',
        ...overrideFields,
    };
};

const getMockDataset = (overrides) => {
    return {
        id: randomString(),
        name: randomString(),
        userId: randomString(),
        createdAt: '2019-12-12T07:34:14.202Z',
        modifiedAt: '2019-12-13T08:36:13.202Z',
        accessedAt: '2019-12-14T08:36:13.202Z',
        itemCount: 5,
        cleanItemCount: 5,
        actId: null,
        actRunId: null,
        fields: [],
        consoleUrl: `https://console.apify.com/storage/datasets/${randomString()}`,
        ...overrides,
    };
};

const getMockKVStore = (overrides) => ({
    id: randomString(),
    name: randomString(),
    userId: randomString(),
    username: randomString(),
    createdAt: '2019-12-12T07:34:14.202Z',
    modifiedAt: '2019-12-13T08:36:13.202Z',
    accessedAt: '2019-12-14T08:36:13.202Z',
    actId: null,
    actRunId: null,
    consoleUrl: 'https://console.apify.com/storage/key-value-stores/27TmTznX9YPeAYhkC',
    stats: {
        readCount: 9,
        writeCount: 3,
        deleteCount: 6,
        listCount: 2,
        s3StorageBytes: 18,
    },
    ...overrides,
});

module.exports = {
    TEST_USER_TOKEN,
    randomString,
    apifyClient,
    createWebScraperTask,
    createAndBuildActor,
    createLegacyCrawlerTask,
    getMockRun,
    getMockWebhookResponse,
    getMockTaskRun,
    getMockActorDetails,
    getMockActorBuild,
    getMockDataset,
    getMockKVStore,
};
