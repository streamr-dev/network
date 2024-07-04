/* eslint-disable @typescript-eslint/no-require-imports */
// CJS entrypoint.
const StreamrClientExports = require('./exports')

Object.assign(StreamrClientExports.StreamrClient, StreamrClientExports)

// required to get require('@streamr/sdk') instead of require('@streamr/sdk').default
module.exports = StreamrClientExports.StreamrClient
