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
                    proxyConfiguration: {
                        useApifyProxy: false,
                    },
                    maxPagesPerCrawl: 1,
                }),
            },
        },
    });
    console.log(`Testing task web-scraper with id ${task.id} created`);
    return task;
};

const createLegacyCrawlerTask = async (pageFunction) => {
    const task = await apifyClient.tasks.createTask({
        task: {
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
