var argv = require('optimist')
	.usage('Usage: $0 --data-topic <topic> --zookeeper <conn_string> --redis <redis_hosts_separated_by_commas> --redis-pwd <password> --cassandra <cassandra_hosts_separated_by_commas> --keyspace <cassandra_keyspace> --streamr <streamr> --port <port>')
	.demand(['data-topic', 'zookeeper', 'redis', 'redis-pwd', 'cassandra', 'keyspace', 'streamr', 'port'])
	.argv

var StreamFetcher = require('./lib/stream-fetcher')
var WebsocketServer = require('./lib/WebsocketServer')
var RedisHelper = require('./lib/redis-helper')
var RedisOffsetFetcher = require('./lib/redis-offset-fetcher')
var CassandraHelper = require('./lib/cassandra-helper')
const StreamrKafkaProducer = require('./lib/StreamrKafkaProducer')
const partitioner = require('./lib/partitioner')

var cors = require('cors')
var app = require('express')()
var http = require('http').Server(app)

var streamFetcher = new StreamFetcher(argv['streamr'])
var redis = new RedisHelper(argv.redis.split(","), argv['redis-pwd'])
var cassandra = new CassandraHelper(argv.cassandra.split(","), argv.keyspace)
var redisOffsetFetcher = new RedisOffsetFetcher(argv.redis.split(",")[0], argv['redis-pwd'])
const kafka = new StreamrKafkaProducer(argv['data-topic'], partitioner, argv['zookeeper'])

app.use(cors())

/**
 * Streaming endpoints
 */
var server = new WebsocketServer(http, redis, cassandra, redisOffsetFetcher, null, streamFetcher)

/**
 * REST endpoints
 */
app.use('/api/v1', require('./lib/rest-endpoints')(cassandra, streamFetcher))
app.use('/api/v1', require('./lib/rest-produce-endpoints')(streamFetcher, kafka, partitioner))

http.listen(argv.port, function() {
	console.log("Listening on port "+argv.port)
})
