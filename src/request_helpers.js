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
    const { data } = response.json;
    response.json = data;
    return response;
};

module.exports = {
    parseDataApiObject,
    includeApiToken,
};
