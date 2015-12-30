// To enable debug logging:
// DEBUG=StreamrClient node examples/node.js

// In your own app, use require('streamr-client') and get it from npm
var StreamrClient = require('../streamr-client')

// Create the client with default options
var client = new StreamrClient()
// Subscribe to a stream
var subscription = client.subscribe(
    '1ef8TbyGTFiAlZ8R2gCaJw', 
    function(message) {
    	// Handle the messages in this stream
		console.log(message)
    },
    {
    	// Resend the last 10 messages on connect
        resend_last: 10
    }
)

// Event binding examples
client.bind('connected', function() {
	console.log('A connection has been established!')
})

subscription.bind('subscribed', function() {
	console.log('Subscribed to '+subscription.streamId)
})

subscription.bind('resending', function() {
	console.log('Resending from '+subscription.streamId)
})

subscription.bind('resent', function() {
	console.log('Resend complete for '+subscription.streamId)
})

subscription.bind('no_resend', function() {
	console.log('Nothing to resend for '+subscription.streamId)
})