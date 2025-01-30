/*
 * This file adds the custom matcher functionality to Jest.
 *
 * The actual setup is in "./dist/src/setupCustomMatchers.js", and this file serves as an alias.
 * Since this file is listed in package.json's "files" section, we can setup the custom matchers
 * like this:
 * setupFilesAfterEnv: ['@streamr/test-utils/setupCustomMatchers']
 */

require('./dist/src/setupCustomMatchers')
