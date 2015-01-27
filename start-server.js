var SocketIoServer = require('./lib/socketio-server').SocketIoServer

var argv = require('optimist')
	.usage('Usage: $0 --zookeeper conn_string')
	.demand(['zookeeper'])
	.argv;

var server = new SocketIoServer(argv.zookeeper)

console.log("Server started.")