# streamr-client

streamr-client is a JavaScript client for connecting to `streamr-socketio-server`. You can subscribe to UI update streams or even raw data streams.

## Usage

```javascript
client = new StreamrClient({ 
	// Connection options 
})
client.subscribe(
	"channel-id", 
	function(message) {
		// Do something with the message, which is an object
	},
	{ 
		// Subscription options 
	}
)
client.connect()
```

## Requirements

* socket.io

## Connection options:

Option | Default value | Description
------ | ------------- | -----------
socketIoUrl | http://localhost:8090 | Address of the `socketio-server` to connect to.

## Subscription options

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

Option | Default value | Description
------ | ------------- | -----------
resend_all | false | Set to `true` if you want all the messages for the channel resent from the earliest available message.
resend_last | 0 | Resend the previous `N` messages.
resend_from | null | Resend from a specific message number.

