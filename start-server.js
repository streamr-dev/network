var SocketIoServer = require('./lib/socketio-server').SocketIoServer

var argv = require('optimist')
	.usage('Usage: $0 --zookeeper <conn_string> --port <port>')
	.demand(['zookeeper', 'port'])
	.argv;

var server = new SocketIoServer(argv.zookeeper, parseInt(argv.port))

console.log("Server started on port "+argv.port)