var app = require('express')();
var http = require('http').Server(app);
var cors = require('cors')

var SocketIoServer = require('./lib/socketio-server')
var RedisHelper = require('./lib/redis-helper')
var CassandraHelper = require('./lib/cassandra-helper')

var argv = require('optimist')
	.usage('Usage: $0 --redis <redis_hosts_separated_by_commas> --cassandra <cassandra_hosts_separated_by_commas> --keyspace <cassandra_keyspace> --port <port>')
	.demand(['redis', 'cassandra', 'keyspace', 'port'])
	.argv;

var app = require('express')();
var http = require('http').Server(app);

var redis = new RedisHelper(argv.redis.split(","))
var cassandra = new CassandraHelper(argv.cassandra.split(","), argv.keyspace)
var server = new SocketIoServer(http, redis)

app.use(cors());

require('./lib/cassandra-rest-endpoints')(app, cassandra)

http.listen(argv.port, function() {
	console.log("Server started on port "+argv.port)
});
