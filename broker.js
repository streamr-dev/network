const http = require('http')
const cors = require('cors')
const express = require('express')
const ws = require('ws')
let optimist = require('optimist')

const { startNetworkNode } = require('@streamr/streamr-p2p-network')

const StreamFetcher = require('./src/StreamFetcher')
const WebsocketServer = require('./src/WebsocketServer')
const Partitioner = require('./src/Partitioner')
const Publisher = require('./src/Publisher')
const VolumeLogger = require('./src/utils/VolumeLogger')

module.exports = async (externalConfig) => {
    let config

    if (!externalConfig) {
        // Check command line args
        optimist = optimist.usage(`You must pass the following command line options:
        --streamr <streamr>
        --port <port>`)
        optimist = optimist.demand(['streamr', 'port'])
        config = optimist.argv
    } else {
        config = externalConfig
    }

    const networkNode = await startNetworkNode('127.0.0.1', '30333')
    const historicalAdapter = null
    const latestOffsetFetcher = null

    // Create some utils
    const volumeLogger = new VolumeLogger()
    const streamFetcher = new StreamFetcher(config.streamr)
    const publisher = new Publisher(networkNode, Partitioner, volumeLogger)

    // Create HTTP server
    const app = express()
    const httpServer = http.Server(app)

    // Add CORS headers
    app.use(cors())

    // Websocket endpoint is handled by WebsocketServer
    const server = new WebsocketServer(
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
                    cb(
                        false,
                        400, // bad request
                        'Invalid headers on websocket request. Please upgrade your browser or websocket library!',
                    )
                }
            },
        }),
        networkNode,
        historicalAdapter,
        latestOffsetFetcher,
        streamFetcher,
        publisher,
        volumeLogger,
    )

    // Rest endpoints
    app.use('/api/v1', require('./src/rest/DataQueryEndpoints')(historicalAdapter, streamFetcher, volumeLogger))
    app.use('/api/v1', require('./src/rest/DataProduceEndpoints')(streamFetcher, publisher, volumeLogger))
    app.use('/api/v1', require('./src/rest/VolumeEndpoint')(volumeLogger))

    // Start the server
    httpServer.listen(config.port, () => {
        console.log(`Configured with Streamr: ${config.streamr}`)
        console.log(`Listening on port ${config.port}`)
        httpServer.emit('listening')
    })

    return {
        httpServer,
        close: () => {
            httpServer.close()
            networkNode.close()
            volumeLogger.stop()
        },
    }
}

// Start the server if we're not being required from another module
if (require.main === module) {
    module.exports()
        .then(() => {})
        .catch((e) => {
            console.error(e)
            process.exit(1)
        })
}
