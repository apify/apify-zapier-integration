const _ = require('lodash');
const {
    APIFY_API_ENDPOINTS,
    SCRAPE_SINGLE_URL_RUN_SAMPLE,
    OMIT_ACTOR_RUN_FIELDS,
    SCRAPE_SINGLE_URL_RUN_OUTPUT_FIELDS,
} = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getDatasetItems } = require('../apify_helpers');

const WEBSITE_CONTENT_CRAWLER_ACTOR_ID = 'aYG0l9s7dbB7j3gbS';

const runWebsiteContentCrawler = async (z, bundle) => {
    const { url, crawlerType } = bundle.inputData;

    // We can use lower memory for Cheerio crawler, because it's not using browser.
    const memory = crawlerType === 'cheerio' ? 1024 : 2048;

    // NOTE: The Zap wait just 30 seconds for the run to finish.
    const timeoutSecs = 60;

    const input = {
        startUrls: [{ url }],
        crawlerType,
        maxCrawlDepth: 0,
        maxCrawlPages: 1,
        maxResults: 1,
        proxyConfiguration: {
            useApifyProxy: true,
        },
        removeCookieWarnings: true,
        saveHtml: true,
        saveMarkdown: true,
    };

    const requestOpts = {
        url: `${APIFY_API_ENDPOINTS.actors}/${WEBSITE_CONTENT_CRAWLER_ACTOR_ID}/runs`,
        method: 'POST',
        params: {
            timeout: timeoutSecs,
            memory,
            waitForFinish: timeoutSecs,
        },
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(input),
    };

    const { data: run } = await wrapRequestWithRetries(z.request, requestOpts);

    const { defaultDatasetId } = run;
    // Attach Apify app URL to detail of run
    run.detailsPageUrl = `https://console.apify.com/actors/${run.actId}/runs/${run.id}`;

    if (defaultDatasetId) {
        const datasetItems = await getDatasetItems(z, defaultDatasetId, { limit: 1 }, run.actId, true);
        if (!datasetItems.items || datasetItems.items.length === 0) {
            throw new Error('The data for the page content is missing, the page cannot be scraped or '
            + `scraper did not finish in time. Please check ${run.detailsPageUrl} for more details.`);
        }
        run.pageUrl = datasetItems.items[0].url;
        run.pageMetadata = datasetItems.items[0].metadata;
        run.pageContent = {
            html: datasetItems.items[0].html,
            markdown: datasetItems.items[0].markdown,
            text: datasetItems.items[0].text,
        };
    }

    // Omit fields, which are useless for Zapier users.
    return _.omit(run, OMIT_ACTOR_RUN_FIELDS);
};

module.exports = {
    key: 'scrapeSingleUrl',
    noun: 'Scrape Single URL',
    display: {
        label: 'Scrape Single URL',
        description: 'Runs a scraper for website and returns its text content.',
    },
    operation: {
        inputFields: [
            {
                label: 'URL',
                helpText: 'The URL of the website to scrape.',
                key: 'url',
                required: true,
                type: 'string',
            },
            {
                label: 'Crawler type',
                helpText: 'Select the crawler type: \n'
                    + '- **Headless web browser** - Useful for modern websites with anti-scraping protections and JavaScript rendering. '
                    + 'It recognizes common blocking patterns like CAPTCHAs and automatically retries blocked requests through new sessions. \n'
                    + '- **Stealthy web browser** (default) - Another headless web browser with anti-blocking measures enabled. '
                    + 'Try this if you encounter bot protection while scraping. \n'
                    + '- **Raw HTTP client** - High-performance crawling mode that uses raw HTTP requests to fetch the pages. '
                    + 'It is faster and cheaper, but it might not work on all websites.',
                key: 'crawlerType',
                required: true,
                type: 'string',
                choices: {
                    'playwright:firefox': 'Headless browser (stealthy Firefox+Playwright) - '
                        + 'Very reliable, best in avoiding blocking, but might be slow',
                    'playwright:chrome': 'Headless browser (Chrome+Playwright) - Reliable, but might be slow',
                    cheerio: 'Raw HTTP client (Cheerio) - Extremely fast, but cannot handle dynamic content',
                },
                default: 'playwright:firefox',
            },
        ],

        perform: runWebsiteContentCrawler,

        sample: SCRAPE_SINGLE_URL_RUN_SAMPLE,
        outputFields: SCRAPE_SINGLE_URL_RUN_OUTPUT_FIELDS,
    },
};
