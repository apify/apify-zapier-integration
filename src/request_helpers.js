const { RetryableError, retryWithExpBackoff } = require('@apify/utilities');
const { ACTOR_RUN_TERMINAL_STATUSES, APIFY_API_ENDPOINTS } = require('./consts');

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

        // Handle full-permission Actors that the user has not approved yet.
        // Approval is a manual action in Apify Console, so retrying won't help - we surface the
        // approvalUrl (when present) so the user can approve the permissions and run the Zap again.
        if (errorInfo && errorInfo.error && errorInfo.error.type === 'full-permission-actor-not-approved') {
            const approvalUrl = errorInfo.error.data && errorInfo.error.data.approvalUrl;
            const userMessage = approvalUrl
                ? `${errorMessage} Approve this Actor's permissions here: ${approvalUrl} — then run the Zap again.`
                : errorMessage;
            throw new z.errors.Error(
                // This message is surfaced to the user
                userMessage,
                'ActorApprovalRequired',
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

const waitForRunToFinish = async (request, runId, timeoutSecs) => {
    const maxWaitingForRequest = 60;
    const pollIntervalMillis = maxWaitingForRequest * 1000;
    const timeoutMillis = timeoutSecs * 1000;
    const startTime = Date.now();
    const options = {
        url: `${APIFY_API_ENDPOINTS.actorRuns}/${runId}?waitForFinish=${maxWaitingForRequest}`,
    };

    while (Date.now() - startTime < timeoutMillis) {
        try {
            const { data: run } = await wrapRequestWithRetries(request, options);

            const runStatus = await run.status;

            if (Object.keys(ACTOR_RUN_TERMINAL_STATUSES).includes(runStatus)) {
                return run;
            }
        } catch (error) {
            throw new Error(`Error while polling for run ${options.url}: ${error}`);
        }

        await new Promise((resolve) => { setTimeout(resolve, pollIntervalMillis); });
    }

    throw new Error(`Timeout of ${timeoutSecs} seconds reached for run ${runId}`);
};

module.exports = {
    parseDataApiObject,
    setApifyRequestHeaders,
    validateApiResponse,
    wrapRequestWithRetries,
    waitForRunToFinish,
};
