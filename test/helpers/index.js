const ApifyClient = require('apify-client');
const zapier = require('zapier-platform-core');

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
    const task = await apifyClient.tasks.createTask({
        task: {
            actId: 'apify/web-scraper',
            name: `zapier-test-${randomString()}`,
            input: {
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    startUrls: [
                        {
                            url: 'https://apify.com',
                        },
                    ],
                    useRequestQueue: true,
                    linkSelector: 'a',
                    pageFunction,
                    proxyConfiguration: {
                        useApifyProxy: false,
                    },
                    maxPagesPerCrawl: 2,
                }),
            },
        },
    });
    console.log(`Testing task web-scrape with id ${task.id} created`);
    return task;
};

const createLegacyCrawlerTask = async (pageFunction) => {
    const task = await apifyClient.tasks.createTask({
        task: {
            actId: 'apify/legacy-phantomjs-crawler',
            name: `zapier-test-${randomString()}`,
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
        },
    });
    console.log(`Testing task legacy-phantomjs-crawler with id ${task.id} created`);
    return task;
};

const createAndBuildActor = async () => {
    const sourceCode = `
    const Apify = require('apify');
    Apify.main(async (context) => {
        console.log('It works.');
        await Apify.pushData({ foo: 'bar' });
        await Apify.setValue('OUTPUT', { foo: 'bar' });
    });
    `;
    const actor = await apifyClient.acts.createAct({
        act: {
            name: `zapier-test-${randomString()}`,
            versions: [
                {
                    versionNumber: '0.0',
                    envVars: [],
                    sourceType: 'SOURCE_CODE',
                    baseDockerImage: 'apify/actor-node-basic',
                    sourceCode,
                    buildTag: 'latest',
                },
            ],
        },
    });
    await apifyClient.acts.buildAct({ actId: actor.id, version: '0.0', waitForFinish: 120 });
    console.log(`Testing actor with id ${actor.id} was created and built.`);
    return actor;
};

module.exports = {
    TEST_USER_TOKEN,
    randomString,
    apifyClient,
    createWebScraperTask,
    createAndBuildActor,
    createLegacyCrawlerTask,
};
