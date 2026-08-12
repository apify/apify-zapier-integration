const { RetryableError, retryWithExpBackoff } = require('@apify/utilities');
const {
    ACTOR_RUN_TERMINAL_STATUSES,
    APIFY_API_ENDPOINTS,
    DEFAULT_RUN_WAIT_TIME_OUT_SECONDS,
    ZAPIER_STEP_TIMEOUT_SECONDS,
} = require('./consts');

const GENERIC_UNHANDLED_ERROR_MESSAGE = 'Oops, Apify API encountered an internal server error. Please report this issue to support@apify.com';

/**
 * Middleware includes the API token on all outbound requests.
 * It runs before each request is sent out, allowing you to make tweaks to the request in a centralized spot.
 */
const setApifyRequestHeaders = (request, z, bundle) => {
    const APIFY_HOSTS = ['api.apify.com'];

    if (APIFY_HOSTS.includes(new URL(request.url).host)) {
        if (bundle.authData.access_token) {
            request.headers.Authorization = `Bearer ${bundle.authData.access_token}`;
        }
        request.headers['x-apify-integration-platform'] = 'zapier';
    }

    return request;
};

/**
 * Middleware Parses nested data object into response.data
 */
const parseDataApiObject = (response) => {
    const { data: responseData } = response;
    if (!responseData) return response;
    response.data = responseData.data
        ? responseData.data
        : responseData;
    return response;
};

/**
 * This middleware log each bad response from Apify API.
 * It uses RetryableError to retry bad responses from Apify API.
 */
const validateApiResponse = (response, z) => {
    /**
     * NOTE: In case key-value store records request we can skip 404 error
     */
    if (['GET', 'HEAD'].includes(response.request.method) && response.request.url.match(/\/records\//) && response.status === 404) {
        response.skipThrowForStatus = true;
        return response;
    }

    /**
     * NOTE: If we throw RetryableError the request will be retried using exponential back off function
     * in case we wrapped it in wrapRequestWithRetries function.
     */
    if (response.status >= 500) throw new RetryableError(GENERIC_UNHANDLED_ERROR_MESSAGE);
    if (response.status === 429) throw new RetryableError('Exceeded rate limit for Apify API. Please try again later.');

    if (response.status >= 300) {
        let errorInfo;
        try {
            errorInfo = JSON.parse(response.content);
        } catch (err) {
            // This can be ignored
        }
        const errorMessage = errorInfo && errorInfo.error ? errorInfo.error.message : GENERIC_UNHANDLED_ERROR_MESSAGE;

        // Handle invalid token errors
        if (errorInfo
            && errorInfo.error
            && errorInfo.error.type
            && (errorInfo.error.type === 'token-not-found' || errorInfo.error.type === 'user-or-token-not-found')) {
            throw new z.errors.Error(
                // This message is surfaced to the user
                errorMessage,
                'AuthenticationError',
                response.status,
            );
        }

        throw new Error(errorMessage);
    }

    return response;
};

/**
 * Wrapper for z.request() to use exponential back off calls
 */
const wrapRequestWithRetries = (request, options) => retryWithExpBackoff({
    func: () => request(options),
    expBackoffMillis: 200,
    expBackoffMaxRepeats: 3,
});

/**
 * Budget left for the synchronous wait, so the rest of the step still fits into Zapier's limit.
 */
const getRemainingSyncWaitSecs = (stepStartedAt) => Math.max(
    1,
    DEFAULT_RUN_WAIT_TIME_OUT_SECONDS - Math.ceil((Date.now() - stepStartedAt) / 1000),
);

const waitForRunToFinish = async (request, runId, timeoutSecs, hasSyncField = false) => {
    const pollIntervalMillis = 1000;
    const timeoutMillis = timeoutSecs * 1000;
    const startTime = Date.now();
    const options = {};

    while (Date.now() - startTime < timeoutMillis) {
        // A single long poll must not outlive the remaining budget.
        const maxWaitingForRequest = Math.min(60, Math.ceil((timeoutMillis - (Date.now() - startTime)) / 1000));
        options.url = `${APIFY_API_ENDPOINTS.actorRuns}/${runId}?waitForFinish=${maxWaitingForRequest}`;

        try {
            const { data: run } = await wrapRequestWithRetries(request, options);

            const runStatus = await run.status;

            if (Object.keys(ACTOR_RUN_TERMINAL_STATUSES).includes(runStatus)) {
                return run;
            }
        } catch (error) {
            throw new Error(`Error while polling for run ${runId} (${options.url}): ${error}`);
        }

        await new Promise((resolve) => { setTimeout(resolve, Math.min(pollIntervalMillis, timeoutMillis - (Date.now() - startTime))); });
    }

    // Only Run Actor and Run Task have the "Run synchronously" field.
    const asyncSuffix = hasSyncField
        ? 'To handle longer runs, set "Run synchronously" to "no" and process the results in a second Zap '
            + 'that starts with a finished run trigger.'
        : 'To handle longer runs, use the Run Actor action with "Run synchronously" set to "no" and process the results '
            + 'in a second Zap that starts with the Finished Actor Run trigger.';
    throw new Error(
        `Run did not finish within the ${ZAPIER_STEP_TIMEOUT_SECONDS}s limit of a Zap step, after which it terminates. `
        + `The run is still active (run ID: ${runId}) and keeps running in the background. `
        + `Check its status and results in Apify Console (https://console.apify.com/view/runs/${runId}). ${asyncSuffix}`,
    );
};

/**
 * Checks whether an error represents a "not found" API response.
 */
const isNotFoundError = (err) => (err?.message ?? '').includes('not found');

module.exports = {
    getRemainingSyncWaitSecs,
    isNotFoundError,
    parseDataApiObject,
    setApifyRequestHeaders,
    validateApiResponse,
    wrapRequestWithRetries,
    waitForRunToFinish,
};
