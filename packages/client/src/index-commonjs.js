// CJS entrypoint.
const StreamrClientExports = require('./index-exports')

Object.assign(StreamrClientExports.StreamrClient, StreamrClientExports)

// required to get require('streamr-client') instead of require('streamr-client').default
module.exports = StreamrClientExports.StreamrClient
