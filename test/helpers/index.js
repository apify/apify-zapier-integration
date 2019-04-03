const ApifyClient = require('apify-client');

const randomString = () => Math.random().toString(32).split('.')[1];

const apifyClient = new ApifyClient({ token: process.env.TEST_USER_TOKEN });

const createWebScraperTask = async () => {
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
                    pageFunction: `
                    async function pageFunction({ request, setValue }) {
                        await setValue('OUTPUT', { test: 'foo bar' });
                        return { url: request.url };
                    }
                    `,
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

module.exports = {
    randomString,
    apifyClient,
    createWebScraperTask,
};
