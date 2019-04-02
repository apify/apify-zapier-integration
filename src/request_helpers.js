/**
 * To include the API key on all outbound requests, simply define a function here.
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
 * Parses nested data object into response.json
 */
const parseDataApiObject = (response) => {
    response.json = response.json && response.json.data
        ? response.json.data
        : {};
    return response;
};

const validateApifyApiResponse = (response) => {
    if (response.status > 300) {
        throw new Error('Bad request to Apify API!');
    }
    return response;
};

module.exports = {
    parseDataApiObject,
    includeApiToken,
    validateApifyApiResponse,
};
