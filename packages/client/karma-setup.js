/**
 * This setup script is executed indirectly by Karma via the `browser-test-runner`
 * package. See karma-config.js in that package for more details.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toThrowStreamrError } = require('./test/test-utils/customMatchers')

if (toThrowStreamrError !== undefined) {
    // eslint-disable-next-line no-undef
    expect.extend({
        toThrowStreamrError
    })
}
