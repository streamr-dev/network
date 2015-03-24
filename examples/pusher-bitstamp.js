var Pusher = require('pusher-client')
var pusher = new Pusher('de504dc5763aeef9ff52')
var rest = require('restler');

var trades_channel = pusher.subscribe('live_trades')

trades_channel.bind('trade', function(data) {
	var msg = {
		stream: "uQ1F_D53S0mIV1h6rYu2RQ",
		auth: "rz4Os2HRSiSJkPduvxAX7g",
		data: data
	}

	console.log(JSON.stringify(data))

	rest.postJson('http://dev.unifina:8888/json', msg).on('complete', function(data, response) {
		if (response)
			console.log(response.statusCode)
		else console.log("Warn: response was null")
	});
})
