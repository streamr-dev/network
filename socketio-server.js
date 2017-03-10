var app = require('express')();
var http = require('http').Server(app);
var cors = require('cors')

var StreamFetcher = require('./lib/stream-fetcher')
var SocketIoServer = require('./lib/socketio-server')
var RedisHelper = require('./lib/redis-helper')
var RedisOffsetFetcher = require('./lib/redis-offset-fetcher')
var CassandraHelper = require('./lib/cassandra-helper')

var argv = require('optimist')
	.usage('Usage: $0 --redis <redis_hosts_separated_by_commas> --redis-pwd <password> --cassandra <cassandra_hosts_separated_by_commas> --keyspace <cassandra_keyspace> --streamr <streamr> --port <port>')
	.demand(['redis', 'redis-pwd', 'cassandra', 'keyspace', 'streamr', 'port'])
	.argv;

var app = require('express')();
var http = require('http').Server(app);

var streamFetcher = new StreamFetcher(argv['streamr'])
var redis = new RedisHelper(argv.redis.split(","), argv['redis-pwd'])
var cassandra = new CassandraHelper(argv.cassandra.split(","), argv.keyspace)
var redisOffsetFetcher = new RedisOffsetFetcher(argv.redis.split(",")[0], argv['redis-pwd'])
var server = new SocketIoServer(http, redis, cassandra, redisOffsetFetcher, null, streamFetcher)

app.use(cors());

require('./lib/cassandra-rest-endpoints')(app, cassandra)

http.listen(argv.port, function() {
	console.log("Server started on port "+argv.port)
});
