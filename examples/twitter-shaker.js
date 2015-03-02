var Twitter = require('twitter');
var rest = require('restler');
 
var client = new Twitter({
  consumer_key: 'RbNml3EHWVtwfaxIiGNBCad8u',
  consumer_secret: 'N1qN1h0zdssLIwe5do4eCWJDVQLP4jCWVCzM5FBV2ta6S4TC3y',
  access_token_key: '2797935057-uAQn8emxCbWXgl3L1aNcNxenbqTpwJ1nQHthLUV',
  access_token_secret: 'OFecwtF7yu612wRq7SWXjsQabHNTq5nU9ZE5dvhrcStrZ'
});

function createFakeClient(latitude, longitude) {
	var shakeLength = Math.ceil(3 + Math.random()*15)
	var shake = function() {
		var strength = 2 + Math.random()*8
		var msg = {
			stream: "1ef8TbyGTFiAlZ8R2gCaJw",
			auth: "VrmwkwEeSaSwBIbFVXN0aw",
			data: {
				val: strength,
				lat: latitude,
				lng: longitude
			}
		}

		console.log(msg)
		rest.postJson('http://dev.unifina:8888/json', msg).on('complete', function(data, response) {
			if (response)
				console.log(response.statusCode)
			else console.log("Warn: response was null")
		});
	}

	
	for (var i=0;i<shakeLength;i++) {
		setTimeout(shake, i*1000)
	}
	
}
 
client.stream('statuses/filter', {track: 'spring,winter,summer,finland'}, function(stream) {
	stream.on('data', function(tweet) {
		if (tweet.coordinates) {
			var longitude = tweet.coordinates.coordinates[0]
			var latitude = tweet.coordinates.coordinates[1]
			console.log("Creating fake client at "+latitude+", "+longitude)
			createFakeClient(latitude, longitude)
		}
	});
	 
	stream.on('error', function(error) {
		console.log("Error: "+error)
	});
});