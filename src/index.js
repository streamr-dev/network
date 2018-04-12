const StreamrClient = require('./StreamrClient')
const AllEndpoints = require('./rest/AllEndpoints')

// Mixin the rest endpoints to the StreamrClient
Object.assign(StreamrClient.prototype, AllEndpoints)

module.exports = StreamrClient
