/**
 * This setup script is executed indirectly by Karma via the `browser-test-runner`
 * package. See karma-config.js in that package for more details.
 */

const { customMatchers } = require('@streamr/test-utils')
expect.extend(customMatchers)