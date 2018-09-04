const http = require('http')
const cors = require('cors')
const express = require('express')
const ws = require('uws')
let optimist = require('optimist')

const StreamFetcher = require('./src/StreamFetcher')
const WebsocketServer = require('./src/WebsocketServer')
const RedisUtil = require('./src/RedisUtil')
const RedisOffsetFetcher = require('./src/RedisOffsetFetcher')
const CassandraUtil = require('./src/CassandraUtil')
const StreamrKafkaProducer = require('./src/KafkaUtil')
const Partitioner = require('./src/Partitioner')
const Publisher = require('./src/Publisher')
const VolumeLogger = require('./src/utils/VolumeLogger')

module.exports = (externalConfig) => {
    let config

    if (!externalConfig) {
        // Check command line args
        optimist = optimist.usage(`You must pass the following command line options:
        --data-topic <topic>
        --zookeeper <conn_string>
        --redis <redis_hosts_separated_by_commas>
        --redis-pwd <password>
        --cassandra <cassandra_hosts_separated_by_commas>
        --keyspace <cassandra_keyspace>
        --streamr <streamr>
        --port <port>`)
        optimist = optimist.demand(['data-topic', 'zookeeper', 'redis', 'redis-pwd', 'cassandra', 'keyspace', 'streamr', 'port'])
        config = optimist.argv
    } else {
        config = externalConfig
    }

    // Create some utils
    const streamFetcher = new StreamFetcher(config.streamr)
    const redis = new RedisUtil(config.redis.split(','), config['redis-pwd'])
    const cassandra = new CassandraUtil(config.cassandra.split(','), config.keyspace)
    const redisOffsetFetcher = new RedisOffsetFetcher(config.redis.split(',')[0], config['redis-pwd'])
    const kafka = new StreamrKafkaProducer(config['data-topic'], Partitioner, config.zookeeper)
    const publisher = new Publisher(kafka, Partitioner)
    const volumeLogger = new VolumeLogger()

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
        redis,
        cassandra,
        redisOffsetFetcher,
        streamFetcher,
        publisher,
        volumeLogger,
    )

    // Rest endpoints
    app.use('/api/v1', require('./src/rest/DataQueryEndpoints')(cassandra, streamFetcher, volumeLogger))
    app.use('/api/v1', require('./src/rest/DataProduceEndpoints')(streamFetcher, publisher, volumeLogger))

    // Start the server
    httpServer.listen(config.port, () => {
        console.log(`Configured with Redis: ${config.redis}`)
        console.log(`Configured with Cassandra: ${config.cassandra}`)
        console.log(`Configured with Kafka: ${config.zookeeper} and topic '${config['data-topic']}'`)
        console.log(`Configured with Streamr: ${config.streamr}`)
        console.log(`Listening on port ${config.port}`)
        httpServer.emit('listening')
    })

    return {
        httpServer,
        close: () => {
            httpServer.close()
            redis.quit()
            redisOffsetFetcher.close()
            cassandra.close()
            kafka.close()
            volumeLogger.stop()
        },
    }
}

// Start the server if we're not being required from another module
if (require.main === module) {
    module.exports()
}
