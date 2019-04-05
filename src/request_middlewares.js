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
const validateApifyApiResponse = (response, z) => {
    if (response.status > 300) {
        z.console.log('Bad response from Apify API', response.content);
        throw new Error('Bad response from Apify API!');
    }
    return response;
};

module.exports = {
    parseDataApiObject,
    includeApiToken,
    validateApifyApiResponse,
};
