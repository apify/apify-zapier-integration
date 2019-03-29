const testAuth = (z, bundle) => {
    // Normally you want to make a request to an endpoint that is either specifically designed to test auth, or one that
    // every user will have access to, such as an account or profile endpoint like /me.
    // In this example, we'll hit httpbin, which validates the Authorization Header against the arguments passed in the URL path

    // This method can return any truthy value to indicate the credentials are valid.
    // Raise an error to show

    return z.request({
        url: 'https://api.apify.com/v2/users/me',
    }).then((response) => {
        console.log(response.json);
        if (response.status === 401) {
            throw new Error('The API Token you supplied is invalid');
        }
        return response.json;
    });
};

module.exports = {
    type: 'custom',
    // Define any auth fields your app requires here. The user will be prompted to enter this info when
    // they connect their account.
    fields: [
        { key: 'token', label: 'API Token', required: true, type: 'string' }
    ],
    // The test method allows Zapier to verify that the credentials a user provides are valid. We'll execute this
    // method whenver a user connects their account for the first time.
    test: testAuth,
    // assuming "username" is a key in the json returned from testAuth
    connectionLabel: (z, bundle) => {
        return bundle.inputData.username;
    }
};
