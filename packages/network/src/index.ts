const { startNetworkNode } = require('./composition')

startNetworkNode({
    host: "127.0.0.1",
    port: 3039,
    id: 'browser-node',
    trackers: []
})