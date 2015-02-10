var http = require('http')
var argv = require('optimist')
	.usage('Usage: $0 --host <host> --port <port> --stream <stream> --auth <auth> --interval <interval>')
	.demand(['host', 'port', 'stream', 'auth'])
	.argv;

var interval = argv.interval || 5000

var options = {
	host: argv.host,
	port: parseInt(argv.port),
	path: '/json',
	method: 'PUT'
}

setInterval(function() {
	var message = {
		stream: argv.stream,
		auth: argv.auth,
		data: {
			random: Math.random()
		}
	}

	var req = http.request(options, function(res) {
	  console.log('STATUS: ' + res.statusCode);
	  res.setEncoding('utf8');
	  res.on('data', function (chunk) {
	    console.log('BODY: ' + chunk);
	  });
	});

	req.on('error', function(e) {
	  console.log('problem with request: ' + e.message);
	});

	// write data to request body
	req.write(JSON.stringify(message));
	req.end();
}, interval)