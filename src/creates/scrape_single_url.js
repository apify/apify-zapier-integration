const _ = require('lodash');
const {
    APIFY_API_ENDPOINTS,
    SCRAPE_SINGLE_URL_RUN_SAMPLE,
    OMIT_ACTOR_RUN_FIELDS,
    SCRAPE_SINGLE_URL_RUN_OUTPUT_FIELDS,
    DEFAULT_RUN_WAIT_TIME_OUT_SECONDS,
} = require('../consts');
const { wrapRequestWithRetries, waitForRunToFinish } = require('../request_helpers');
const { getDatasetItems } = require('../apify_helpers');

const WEBSITE_CONTENT_CRAWLER_ACTOR_ID = 'aYG0l9s7dbB7j3gbS';

const runWebsiteContentCrawler = async (z, bundle) => {
    const { url, crawlerType } = bundle.inputData;

    // We can use lower memory for Cheerio crawler, because it's not using browser.
    const memory = crawlerType === 'cheerio' ? 1024 : 4096;

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
            memory,
        },
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(input),
    };

    let { data: run } = await wrapRequestWithRetries(z.request, requestOpts);
    run = await waitForRunToFinish(z.request, run.id, DEFAULT_RUN_WAIT_TIME_OUT_SECONDS);

    const { defaultDatasetId } = run;
    // Attach Apify app URL to detail of run
    run.detailsPageUrl = `https://console.apify.com/actors/${run.actId}/runs/${run.id}`;

    if (defaultDatasetId) {
        const datasetItems = await getDatasetItems(z, defaultDatasetId, bundle.authData.access_token, { limit: 1 }, run.actId, true);
        if (!datasetItems.items || datasetItems.items.length === 0) {
            throw new Error('The data for the page content is missing. The scraper cannot scrape the page '
                + `or did not finish on time. Please check ${run.detailsPageUrl}#log for more details.`);
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
        description: 'Runs a scraper for the website and returns its content as text, markdown and HTML. '
            + 'This action is made for getting content of a single page, for example, to use in large language models (LLM) flows.',
    },
    operation: {
        inputFields: [
            {
                label: 'Note',
                key: 'note',
                type: 'copy',
                helpText: 'This action is designed to scrape the content of a single web page. '
                    + 'Behind the scenes, it utilizes [Website Content Crawler](https://apify.com/apify/website-content-crawler). '
                    + 'You can choose to run either [Website Content Crawler](https://apify.com/apify/website-content-crawler) or '
                    + '[Web Scraper](https://apify.com/apify/web-scraper), '
                    + 'both of which offer a range of options to assist you in dealing with anti-scraping or '
                    + 'scraping multiple URLs and many more. These scrapers are available to run under "Run Actor" in Apify Zaps.',
            },
            {
                label: 'URL',
                helpText: 'The URL of the website to scrape.',
                key: 'url',
                required: true,
                type: 'string',
            },
            {
                label: 'Crawler type',
                helpText: '- **Headless web browser** - Useful for modern websites with anti-scraping protections and JavaScript rendering. '
                    + 'It recognizes common blocking patterns like CAPTCHAs and automatically retries blocked requests through new sessions. \n'
                    + '- **Stealthy web browser** (default) - Another headless web browser with anti-blocking measures enabled. '
                    + 'Try this if you encounter anti-bot protections while scraping. \n'
                    + '- **Raw HTTP client** - High-performance crawling mode that uses raw HTTP requests to fetch the pages. '
                    + 'It is faster and cheaper, but it might not work on all websites.',
                key: 'crawlerType',
                required: true,
                type: 'string',
                choices: {
                    'playwright:firefox': 'Headless browser (stealthy Firefox+Playwright) - '
                        + 'Very reliable. Great for avoiding blocking, but it might be slow',
                    'playwright:chrome': 'Headless browser (Chrome+Playwright) - Reliable, but might be slow',
                    cheerio: 'Raw HTTP client (Cheerio) - Extremely fast, but cannot handle dynamic content',
                },
                default: 'cheerio',
            },
        ],

        perform: runWebsiteContentCrawler,

        sample: SCRAPE_SINGLE_URL_RUN_SAMPLE,
        outputFields: SCRAPE_SINGLE_URL_RUN_OUTPUT_FIELDS,
    },
};
