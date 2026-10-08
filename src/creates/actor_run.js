const _ = require('lodash');
const {
    ACTOR_RUN_SAMPLE,
    ACTOR_RUN_OUTPUT_FIELDS, ACTOR_SEARCH_SOURCES,
    RECENTLY_USED_ACTORS_KEY,
    DEFAULT_SYNC_RUN_TIMEOUT_SECS,
    OMIT_ACTOR_RUN_FIELDS,
} = require('../consts');
const {
    enrichActorRun,
    getActorAdditionalFields,
    buildActorRunRequestOptions,
    requestActorOrThrowNotFound,
    buildRunCallbackWebhookParam,
    getActorRunOnResume,
} = require('../apify_helpers');
const { waitForRunToFinish, getRemainingTestStepWaitSecs } = require('../request_helpers');
const { getActorDatasetOutputFields } = require('../output_fields');

const runActor = async (z, bundle) => {
    const stepStartedAt = Date.now();
    const { actorId, runSync, timeoutSecs } = bundle.inputData;

    const requestOpts = await buildActorRunRequestOptions(z, bundle);

    // The Zap editor cannot wait for the callback, so a test step waits for the results inline.
    const isTestStep = !!bundle.meta?.isLoadingSample;

    // Calling z.generateCallbackUrl() is what pauses the Zap step, so it must not be called when running async.
    if (runSync) {
        requestOpts.params.timeout = Math.min(timeoutSecs || DEFAULT_SYNC_RUN_TIMEOUT_SECS, DEFAULT_SYNC_RUN_TIMEOUT_SECS);
        if (!isTestStep) requestOpts.params.webhooks = buildRunCallbackWebhookParam(z.generateCallbackUrl());
    }

    const { data: run } = await requestActorOrThrowNotFound(z, requestOpts, actorId);

    if (runSync) {
        // The step is paused here and finished by performResume once the run reaches a terminal status.
        if (!isTestStep) return _.omit(run, OMIT_ACTOR_RUN_FIELDS);

        const waitedRun = await waitForRunToFinish(z.request, run.id, getRemainingTestStepWaitSecs(stepStartedAt));
        return enrichActorRun(z, bundle.authData.access_token, waitedRun || run);
    }

    return enrichActorRun(z, bundle.authData.access_token, run);
};

const resumeActorRun = async (z, bundle) => {
    const run = await getActorRunOnResume(z, bundle, true);
    return enrichActorRun(z, bundle.authData.access_token, run);
};

module.exports = {
    key: 'createActorRun',
    noun: 'Actor Run',
    display: {
        label: 'Run Actor',
        description: 'Runs an Apify Actor (a cloud program for web scraping, data extraction, or automation) with custom input parameters. '
            + 'Use this for ad-hoc runs; if you already have a saved configuration in Apify Console, use Run Task instead. '
            + 'By default the step waits for the run to finish and returns its results. '
            + 'It always returns the run ID, status, and default dataset ID, so you can also fetch the results later '
            + 'with Fetch Dataset Items or look up the run with Find Last Actor Run.',
    },

    operation: {
        inputFields: [
            {
                label: 'Search Actors from',
                helpText: 'Please select the source to search Actors from.',
                key: 'searchLocation',
                required: true,
                type: 'string',
                default: RECENTLY_USED_ACTORS_KEY,
                choices: ACTOR_SEARCH_SOURCES,
                altersDynamicFields: true,
            },
            {
                label: 'Actor',
                helpText: 'Please select the Actor to run, or pass an Actor ID or slug directly (for example `apify~web-scraper`).',
                key: 'actorId',
                required: true,
                dynamic: 'actorsWithStore.id.name',
                altersDynamicFields: true,
            },
            {
                label: 'Run synchronously',
                helpText: 'With `yes` (the default), this step waits until the Actor run finishes and then returns its results. '
                    + 'The Zap shows the step as waiting in the meantime, and the run is limited by the Timeout set below, '
                    + 'at most 1 hour, after which it is stopped. '
                    + 'If you choose `no`, the step returns as soon as the run starts, and you can fetch the results in a later step '
                    + 'with Find Last Actor Run or Fetch Dataset Items, or in a second Zap that starts with the Finished Actor Run trigger. '
                    + 'Note: testing this step on its own in the Zap editor waits only about 25 seconds and then returns the results '
                    + 'produced so far, so you can map them in the next step. Test the whole Zap to see the finished run and all its results.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'yes',
            },
            getActorAdditionalFields,
        ],

        perform: runActor,
        performResume: resumeActorRun,

        sample: ACTOR_RUN_SAMPLE,
        outputFields: [
            ...ACTOR_RUN_OUTPUT_FIELDS,
            getActorDatasetOutputFields,
        ],
    },
};
