const argv = require('optimist')
    .usage('Usage: $0 --data-topic <topic> --zookeeper <conn_string> --redis <redis_hosts_separated_by_commas> --redis-pwd <password> --cassandra <cassandra_hosts_separated_by_commas> --keyspace <cassandra_keyspace> --streamr <streamr> --port <port>')
    .demand(['data-topic', 'zookeeper', 'redis', 'redis-pwd', 'cassandra', 'keyspace', 'streamr', 'port'])
    .argv

const cors = require('cors')
const StreamFetcher = require('./src/StreamFetcher')
const WebsocketServer = require('./src/WebsocketServer')
const RedisHelper = require('./src/RedisUtil')
const RedisOffsetFetcher = require('./src/RedisOffsetFetcher')
const CassandraHelper = require('./src/CassandraUtil')
const StreamrKafkaProducer = require('./src/KafkaUtil')
const partitioner = require('./src/Partitioner')

const app = require('express')()
const http = require('http').Server(app)

const streamFetcher = new StreamFetcher(argv.streamr)
const redis = new RedisHelper(argv.redis.split(','), argv['redis-pwd'])
const cassandra = new CassandraHelper(argv.cassandra.split(','), argv.keyspace)
const redisOffsetFetcher = new RedisOffsetFetcher(argv.redis.split(',')[0], argv['redis-pwd'])
const kafka = new StreamrKafkaProducer(argv['data-topic'], partitioner, argv.zookeeper)

app.use(cors())

/**
 * Streaming endpoints
 */
const server = new WebsocketServer(http, redis, cassandra, redisOffsetFetcher, null, streamFetcher)

/**
 * REST endpoints
 */
app.use('/api/v1', require('./src/rest/DataQueryEndpoints')(cassandra, streamFetcher))
app.use('/api/v1', require('./src/rest/DataProduceEndpoints')(streamFetcher, kafka, partitioner))

http.listen(argv.port, () => {
    console.log(`Configured with Redis: ${argv.redis}`)
    console.log(`Configured with Cassandra: ${argv.cassandra}`)
    console.log(`Configured with Kafka: ${argv.zookeeper} and topic '${argv['data-topic']}'`)
    console.log(`Configured with Streamr: ${argv.streamr}`)
    console.log(`Listening on port ${argv.port}`)
})
