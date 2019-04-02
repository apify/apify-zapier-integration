const zapier = require('zapier-platform-core');
const { expect } = require('chai');

const App = require('../index');
const appTester = zapier.createAppTester(App);

describe('triggers', () => {

    describe('new task run trigger', () => {
        // TODO
        // it('should load recipe from fake hook', async () => {
        //     const bundle = {
        //         inputData: {
        //             style: 'mediterranean'
        //         },
        //         cleanedRequest: {
        //             id: 1,
        //             name: 'name 1',
        //             directions: 'directions 1'
        //         }
        //     };
        //
        //     const results = await appTester(App.triggers.recipe.operation.perform, bundle);
        //
        //
        //
        //     expect(results.length).to.be.eql(1);
        //
        // });

    });

});
