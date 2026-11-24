/* eslint-env mocha */
const { expect } = require('chai');

const {
    decodeResponseBody,
    getErrorFromBody,
    getServerActorOrigin,
    parseActorReference,
} = require('../src/server_actor');

describe('server actor', () => {
    describe('decodeResponseBody', () => {
        it('parses JSON, also without a content type and for +json types', () => {
            expect(decodeResponseBody(Buffer.from('{"a":1}'), 'application/json')).to.eql({ body: { a: 1 } });
            expect(decodeResponseBody(Buffer.from('[1]'), 'application/problem+json')).to.eql({ body: [1] });
            expect(decodeResponseBody(Buffer.from('{"a":1}'), '')).to.eql({ body: { a: 1 } });
        });

        it('keeps other text, and JSON that does not parse, as a string', () => {
            expect(decodeResponseBody(Buffer.from('<p>Hi</p>'), 'text/html')).to.eql({ body: '<p>Hi</p>' });
            expect(decodeResponseBody(Buffer.from('{"a":'), 'application/json')).to.eql({ body: '{"a":' });
            expect(decodeResponseBody(Buffer.from('{"a":1}\n{"a":2}\n'), 'application/x-ndjson')).to.eql({ body: '{"a":1}\n{"a":2}\n' });
        });

        it('returns null for an empty body', () => {
            expect(decodeResponseBody(Buffer.alloc(0), 'application/json')).to.eql({ body: null });
        });

        it('detects binary data by content type, and by invalid UTF-8', () => {
            expect(decodeResponseBody(Buffer.from('PNG'), 'image/png')).to.eql({ binary: true });
            expect(decodeResponseBody(Buffer.from('%PDF'), 'application/pdf')).to.eql({ binary: true });
            expect(decodeResponseBody(Buffer.from([0xff, 0xfe, 0x00]), '')).to.eql({ binary: true });
            expect(decodeResponseBody(Buffer.from([0xc3, 0x28]), 'text/plain')).to.eql({ binary: true });
        });
    });

    describe('getErrorFromBody', () => {
        it('reads Apify\'s nested error, a flat error and code, and other common shapes', () => {
            expect(getErrorFromBody({ error: { type: 'record-not-found', message: 'Not found' } }))
                .to.eql({ message: 'Not found', type: 'record-not-found' });
            expect(getErrorFromBody({ error: 'URL is required', code: 'INVALID_INPUT' })).to.eql({ message: 'URL is required', type: 'INVALID_INPUT' });
            expect(getErrorFromBody({ detail: 'Validation failed' })).to.eql({ message: 'Validation failed', type: undefined });
            expect(getErrorFromBody({ title: 'Bad Request', type: 'about:blank' })).to.eql({ message: 'Bad Request', type: 'about:blank' });
        });

        it('takes only the title of an HTML error page', () => {
            const page = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>\n  Page not found &amp; gone &#8211; Apify\n</title>'
                + '<script src="/_next/static/chunks/main.js"></script></head><body>404</body></html>';
            expect(getErrorFromBody(page, 'text/html')).to.eql({ message: 'Page not found & gone – Apify' });
            // Recognized by its start too, when the Actor sends no HTML content type.
            expect(getErrorFromBody(page, '')).to.eql({ message: 'Page not found & gone – Apify' });
            expect(getErrorFromBody('<html><body><script>x()</script></body></html>', 'text/html')).to.eql({ message: undefined });
            // Plain text that mentions HTML stays as it is.
            expect(getErrorFromBody('Expected <html> input', 'text/plain')).to.eql({ message: 'Expected <html> input' });
        });

        it('takes a text body as the message, cut to 1000 characters', () => {
            expect(getErrorFromBody('  Gateway Timeout  ')).to.eql({ message: 'Gateway Timeout' });
            expect(getErrorFromBody('x'.repeat(5000)).message).to.have.lengthOf(1000);
            expect(getErrorFromBody(null)).to.eql({});
            expect(getErrorFromBody(['a'])).to.eql({});
        });
    });

    describe('parseActorReference', () => {
        it('takes an ID or a name as it is, trimmed', () => {
            expect(parseActorReference(' a6Sqhlnt4touIHTub ')).to.equal('a6Sqhlnt4touIHTub');
            expect(parseActorReference('apify~web-fetch')).to.equal('apify~web-fetch');
            expect(parseActorReference('')).to.equal('');
            expect(parseActorReference(undefined)).to.equal('');
        });

        it('rejects values that are not an ID or name, as they go into the API URL path', () => {
            // URLs resolve "." and ".." as dot segments: /v2/acts/.. would be /v2/.
            [
                '.',
                '..',
                ' .. ',
                'apify/web-fetch',
                'apify/web-fetch/x',
                '/web-fetch',
                'apify web-fetch',
                'apify~web-fetch?x=1',
                '%2e%2e',
                'https://apify.com/apify/web-fetch',
            ].forEach((value) => expect(parseActorReference(value), value).to.equal(undefined));
        });
    });

    describe('getServerActorOrigin', () => {
        it('returns the origin of an https *.apify.actor standby URL', () => {
            expect(getServerActorOrigin({ actorStandby: { isEnabled: true }, standbyUrl: 'https://web-fetch.apify.actor/' }))
                .to.equal('https://web-fetch.apify.actor');
        });

        it('rejects an Actor without a server interface, or with a URL that would take the token elsewhere', () => {
            [
                { standbyUrl: 'https://web-fetch.apify.actor' },
                { actorStandby: { isEnabled: false }, standbyUrl: 'https://web-fetch.apify.actor' },
                { actorStandby: { isEnabled: true } },
                { actorStandby: { isEnabled: true }, standbyUrl: 'http://web-fetch.apify.actor' },
                { actorStandby: { isEnabled: true }, standbyUrl: 'https://web-fetch.apify.actor.example.com' },
                { actorStandby: { isEnabled: true }, standbyUrl: 'https://example.com' },
                { actorStandby: { isEnabled: true }, standbyUrl: 'not a url' },
            ].forEach((actor) => expect(getServerActorOrigin(actor), JSON.stringify(actor)).to.equal(undefined));
        });
    });
});
