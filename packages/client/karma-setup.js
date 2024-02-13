/**
 * This setup script is executed indirectly by Karma via the `browser-test-runner`
 * package. See karma-config.js in that package for more details.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toThrowStreamrError } = require('./test/test-utils/customMatchers')

// Karma runner ends up reporting an error if we don't have this check here. TODO: investigate why this is
if (toThrowStreamrError !== undefined) {
    // eslint-disable-next-line no-undef
    expect.extend({
        toThrowStreamrError
    })
}
