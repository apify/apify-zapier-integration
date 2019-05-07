const { RetryableError, retryWithExpBackoff } = require('apify-shared/exponential_backoff');

const GENERIC_UNHANDLED_ERROR_MESSAGE = 'Oops, Apify API encountered an internal server error. Please, report this issue to support@apify.com';

/**
 * Middleware includes the API token on all outbound requests.
 * It runs runs before each request is sent out, allowing you to make tweaks to the request in a centralized spot.
 */
const includeApiToken = (request, z, bundle) => {
    if (bundle.authData.token) {
        request.params = request.params || {};
        request.params.token = bundle.authData.token;
    }
    return request;
};

/**
 * Middleware Parses nested data object into response.json
 */
const parseDataApiObject = (response) => {
    response.json = response.json && response.json.data
        ? response.json.data
        : {};
    return response;
};

/**
 * This middleware log each bad response from Apify API.
 */
const validateApiResponse = (response) => {
    /**
     * NOTE: If we throw RetryableError the request will be retried using exponential back off function
     * in case we wrapped it in wrapRequestWithRetries function.
     */
    if (response.status >= 500) throw new RetryableError(GENERIC_UNHANDLED_ERROR_MESSAGE);
    if (response.status === 429) throw new RetryableError('Exceeded the rate limit for Apify API. Please try again later.');


    if (response.status >= 300) {
        let errorInfo;
        try {
            errorInfo = JSON.parse(response.content);
        } catch (err) {
            // This can be ignored
        }
        const errorMessage = errorInfo && errorInfo.error ? errorInfo.error.message : GENERIC_UNHANDLED_ERROR_MESSAGE;
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

module.exports = {
    parseDataApiObject,
    includeApiToken,
    validateApiResponse,
    wrapRequestWithRetries,
};
