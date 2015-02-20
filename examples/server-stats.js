var cpuStats = require('cpu-stats')
var os = require('os')
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

function sendMessage(cpu, mem) {
	var message = {
		stream: argv.stream,
		auth: argv.auth,
		data: {
			cpu: cpu,
			mem: mem
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
	  console.log('Request error: ' + e.message);
	});

	// write data to request body
	req.write(JSON.stringify(message));
	req.end();
}

function cb(error, result) {
	var mem = (1 - (os.freemem() / os.totalmem()))*100
	var cpu = 0
	result.forEach(function(item) {
		cpu += item.cpu
	})
	cpu = cpu / result.length
	console.log("CPU: "+cpu+", Mem: "+mem)

	sendMessage(cpu, mem)

	cpuStats(interval, cb)
}

cpuStats(interval, cb)