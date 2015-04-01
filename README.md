# streamr-client

streamr-client is a JavaScript client for connecting to Streamr data. You can subscribe to user interface widget updates or even raw data streams.

## Requirements

* socket.io

## Usage

```javascript
client = new StreamrClient({ 
	// Connection options and default values
	server: 'api.streamr.com',
	autoConnect: true,
	autoDisconnect: true
})
client.subscribe(
	'channel-id', 
	function(message) {
		// Do something with the message, which is an object
	},
	{ 
		// Subscription options, see below
	}
)
client.connect()
```

## Connection options

Option | Default value | Description
------ | ------------- | -----------
server | api.streamr.com | Address of the server to connect to.
autoConnect | true | If set to `true`, the client connects automatically on the first call to `subscribe()`. Otherwise an explicit call to `connect()` is required.
autoDisconnect | true  | If set to `true`, the client automatically disconnects when the last channel is unsubscribed. Otherwise the connection is left open and can be disconnected explicitly by calling `disconnect()`.

## Subscription options

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

Option | Default value | Description
------ | ------------- | -----------
resend_all | false | Set to `true` if you want all the messages for the channel resent from the earliest available message.
resend_last | 0 | Resend the previous `N` messages.
resend_from | null | Resend from a specific message number.

## Methods

Name | Description
---- | -----------
connect() | Connects to the server, and also subscribes to any streams for which `subscribe()` has been called before calling `connect()`.
disconnect() | Disconnects from the server, clearing all subscriptions.
pause() | Disconnects from the server without clearing subscriptions.
subscribe(streamId, callback, options) | Subscribes to a stream identified by the string `streamId`. Messages in this stream are passed to the `callback` function. See the above table for subscription `options`.
unsubscribe(streamId) | Unsubscribes from the stream `streamId`. The callbacks for this stream might still receive messages before the unsubscribe is acknowledged by the server.
bind(eventName, function) | Binds a `function` to an event called `eventName`
unbind(eventName, function) | Unbinds the `function` from events called `eventName`

## Events

Name | Handler Arguments | Description
---- | ----------------- | -----------
subscribed | [streamId1, streamId2, ...] | Fired when a subscription request is acknowledged by the server. The bound functions will be called with a list of subscribed streamIds as the argument. Note that this list may not contain all the currently subscribed streams.
unsubscribed | streamId | Fired when an unsubscription is acknowledged by the server. The callbacks for this stream should no longer receive messages for this stream.
connected |  | Fired when the client has connected (or reconnected).
disconnected |  | Fired when the client has disconnected (or paused).
