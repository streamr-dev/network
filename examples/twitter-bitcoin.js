var Twitter = require('twitter');
var rest = require('restler');

var client = new Twitter({
  consumer_key: 'qyxS885pgywsp8mBLPQjNeDaz',
  consumer_secret: 'sFWEx6DMatuDy1JRClatRe4NjjJPD3rPXkcdXJhdc88nXMlsQd',
  access_token_key: '2797935057-NTJo8V5dWtUvVa1jVgqGDnEtFk7fomih35KHHO3',
  access_token_secret: 'iNneilvKGCN60bEAmnUHhSmjO0lyZpxp8X4HoQCl1gTUq'
});

client.stream('statuses/filter', {track: 'bitcoin,#btc'}, function(stream) {
	stream.on('data', function(tweet) {
		if (tweet.limit)
			console.log("Rate limited: "+tweet.limit.track)
		else {
			var msg = {
				stream: "ln2g8OKHSdi7BcL-bcnh2g",
				auth: "TaPRLN84RXqh8HXuFjQDLg",
				data: tweet
			}

			console.log(tweet.text)

			rest.postJson('http://dev.unifina:8888/json', msg).on('complete', function(data, response) {
				if (response)
					console.log(response.statusCode)
				else console.log("Warn: response was null")
			});
		}
	});
	 
	stream.on('error', function(error) {
		console.log("Error: "+error)
	});
});