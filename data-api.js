var argv = require('optimist')
	.usage('Usage: $0 --data-topic <topic> --zookeeper <conn_string> --redis <redis_hosts_separated_by_commas> --redis-pwd <password> --cassandra <cassandra_hosts_separated_by_commas> --keyspace <cassandra_keyspace> --streamr <streamr> --port <port>')
	.demand(['data-topic', 'zookeeper', 'redis', 'redis-pwd', 'cassandra', 'keyspace', 'streamr', 'port'])
	.argv;

var StreamFetcher = require('./lib/stream-fetcher')
var SocketIoServer = require('./lib/WebsocketServer')
var RedisHelper = require('./lib/redis-helper')
var RedisOffsetFetcher = require('./lib/redis-offset-fetcher')
var CassandraHelper = require('./lib/cassandra-helper')
const StreamrKafkaProducer = require('./lib/StreamrKafkaProducer')
const partitioner = require('./lib/partitioner')

const bodyParser = require('body-parser')
var cors = require('cors')
var app = require('express')();
var http = require('http').Server(app);

var streamFetcher = new StreamFetcher(argv['streamr'])
var redis = new RedisHelper(argv.redis.split(","), argv['redis-pwd'])
var cassandra = new CassandraHelper(argv.cassandra.split(","), argv.keyspace)
var redisOffsetFetcher = new RedisOffsetFetcher(argv.redis.split(",")[0], argv['redis-pwd'])
const kafka = new StreamrKafkaProducer(argv['data-topic'], partitioner, argv['zookeeper'])
var server = new SocketIoServer(http, redis, cassandra, redisOffsetFetcher, null, streamFetcher)

app.use(cors())

require('./lib/rest-endpoints')(app, cassandra, redisOffsetFetcher)

http.listen(argv.port, function() {
	console.log("Listening on port "+argv.port)
});

// Don't bind produce endpoints before Kafka is ready
kafka.on('ready', function() {
	app.use(bodyParser.raw({
		limit: '1024kb',                     // Increase body size limit, default is 100kb
		type: function() { return true }     // Parse everything as raw
	}))                                      // Body becomes available as Buffer

	require('./lib/rest-produce-endpoints')(app, streamFetcher, kafka, partitioner)

	console.log("Ready to produce")
})
