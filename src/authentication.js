const { ME_USER_NAME_PLACEHOLDER } = require('@apify/consts');
const { APIFY_API_ENDPOINTS } = require('./consts');
const { wrapRequestWithRetries } = require('./request_helpers');

const getAccessToken = async (z, bundle) => {
    const response = await z.request({
        url: 'https://console-backend.apify.com/oauth/apps/token',
        method: 'POST',
        body: {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            redirect_uri: '{{bundle.inputData.redirect_uri}}',
            grant_type: 'authorization_code',
            code: bundle.inputData.code,
            code_verifier: '{{bundle.inputData.code_verifier}}', // Added for PKCE
        },
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    return {
        token: response.data.access_token,
    };
};

// This method can return any truthy value to indicate the credentials are valid.
const testAuth = async (z) => {
    const response = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.users}/${ME_USER_NAME_PLACEHOLDER}`,
    });

    if (response.status !== 200) {
        throw new Error('The API token is not valid.');
    }

    return response.data;
};

module.exports = {
    type: 'oauth2',
    oauth2Config: {
        authorizeUrl: {
            url: 'https://console.apify.com/authorize/oauth',
            params: {
                client_id: '{{process.env.CLIENT_ID}}',
                state: '{{bundle.inputData.state}}',
                redirect_uri: '{{bundle.inputData.redirect_uri}}',
                response_type: 'code',
            },
        },
        getAccessToken,
        autoRefresh: false, // Otherwise it will throw RefreshAuthError which cannot be handled from the intergration
        enablePkce: true,
    },
    fields: [],
    test: testAuth,
    connectionLabel: (z, bundle) => {
        // Values are taken from the "test" response
        return bundle.inputData.username || bundle.inputData.email;
    },
};
