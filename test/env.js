const JSDomEnvironment = require('jest-environment-jsdom').default;
const { TextEncoder, TextDecoder } = require('util')

/**
 * A custom environment to set TextEncoder/TextDecoder
 * Thanks https://stackoverflow.com/a/57713960/1976323
 */
module.exports = class CustomTestEnvironment extends JSDomEnvironment {
    async setup() {
        await super.setup();
        if (this.global.TextEncoder === undefined) {
            this.global.TextEncoder = TextEncoder;
        }
        if (this.global.TextDecoder === undefined) {
            this.global.TextDecoder = TextDecoder;
        }

        // work around https://github.com/facebook/jest/issues/7780
        this.global.Uint8Array = Uint8Array;
        this.global.ArrayBuffer = ArrayBuffer;

        // jsdom does not provide structuredClone, which IndexedDB needs to
        // store values. Node has had it built in since 17.
        if (this.global.structuredClone === undefined) {
            this.global.structuredClone = structuredClone;
        }
    }

    exportConditions() {
        // JSDomEnvironment returns ['browser'] but tests run in node which
        // has issues with some ESM modules.
        return ['node'];
    }
};
