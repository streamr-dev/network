/* eslint-disable @typescript-eslint/no-require-imports */
// CJS entrypoint.
const StreamrClientExports = require('./exports')

Object.assign(StreamrClientExports.StreamrClient, StreamrClientExports)

// required to get require('streamr-client') instead of require('streamr-client').default
module.exports = StreamrClientExports.StreamrClient
