var StreamrClient = require('../streamr-client') // use require('streamr-client') in your own app

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
