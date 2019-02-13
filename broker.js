const http = require('http')
const cors = require('cors')
const express = require('express')
const ws = require('sc-uws')
const Optimist = require('optimist')

const { startNetworkNode } = require('@streamr/streamr-p2p-network')

const StreamFetcher = require('./src/StreamFetcher')
const WebsocketServer = require('./src/WebsocketServer')
const { startCassandraStorage } = require('./src/Storage')
const Partitioner = require('./src/Partitioner')
const Publisher = require('./src/Publisher')
const VolumeLogger = require('./src/utils/VolumeLogger')

const dataQueryEndpoints = require('./src/rest/DataQueryEndpoints')
const dataProduceEndpoints = require('./src/rest/DataProduceEndpoints')
const volumeEndpoint = require('./src/rest/VolumeEndpoint')

module.exports = async (config) => {
    const networkNode = await startNetworkNode(config.networkHostname, config.networkPort)
    await networkNode.addBootstrapTracker('ws://127.0.0.1:30300')

    const historicalAdapter = null
    const latestOffsetFetcher = null

    // Create some utils
    const storage = await startCassandraStorage(config.cassandra.split(','), 'datacenter1', config.keyspace)
    const volumeLogger = new VolumeLogger()
    const streamFetcher = new StreamFetcher(config.streamr)
    const publisher = new Publisher(networkNode, Partitioner, volumeLogger)

    // Create HTTP server
    const app = express()
    const httpServer = http.Server(app)

    // Add CORS headers
    app.use(cors())

    // Websocket endpoint is handled by WebsocketServer
    const websocketServer = new WebsocketServer(
        new ws.Server({
            server: httpServer,
            path: '/api/v1/ws',
            /**
             * Gracefully reject clients sending invalid headers. Without this change, the connection gets abruptly closed,
             * which makes load balancers such as nginx think the node is not healthy.
             * This blocks ill-behaving clients sending invalid headers, as well as very old websocket implementations
             * using draft 00 protocol version (https://tools.ietf.org/html/draft-ietf-hybi-thewebsocketprotocol-00)
             */
            verifyClient: (info, cb) => {
                if (info.req.headers['sec-websocket-key']) {
                    cb(true)
                } else {
                    cb(false, 400, 'Invalid headers on websocket request. Please upgrade your browser or websocket library!')
                }
            },
        }),
        networkNode,
        storage,
        streamFetcher,
        publisher,
        volumeLogger,
    )

    // Rest endpoints
    app.use('/api/v1', dataQueryEndpoints(storage, streamFetcher, volumeLogger))
    app.use('/api/v1', dataProduceEndpoints(streamFetcher, publisher, volumeLogger))
    app.use('/api/v1', volumeEndpoint(volumeLogger))

    // Start the server
    httpServer.listen(config.port, () => {
        console.info(`Configured with Streamr: ${config.streamr}`)
        console.info(`Network node running on ${config.networkHostname}:${config.networkPort}`)
        console.info(`Listening on port ${config.port}`)
        httpServer.emit('listening')
    })

    return {
        httpServer,
        websocketServer,
        close: () => {
            httpServer.close()
            networkNode.close()
            storage.close()
            volumeLogger.stop()
        },
    }
}

// Start the server if we're not being required from another module
if (require.main === module) {
    // Check command line args
    let optimist = Optimist.usage(`You must pass the following command line options:
        --cassandra <cassandra_hosts_separated_by_commas>
        --keyspace <cassandra_keyspace>
        --networkHostname <networkHostname>
        --networkPort <networkPort>
        --streamr <streamr>
        --port <port>`)
    optimist = optimist.demand(['cassandra', 'keyspace', 'networkHostname', 'networkPort', 'streamr', 'port'])

    module.exports(optimist.argv)
        .then(() => {})
        .catch((e) => {
            console.error(e)
            process.exit(1)
        })
}
