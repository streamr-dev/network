<!-- Note that this readme is embedded on API Documentation page within Streamr. Please don't use first-level headings (h1). You should write this document so that it will work both as a stand-alone document in the public GitHub repo and as a section in the API docs. -->
<a name="js-client"></a>
## Streamr JavaScript Client

By using this client, you can easily interact with the [Streamr](http://www.streamr.com) API from JavaScript-based environments, such as browsers and [node.js](https://nodejs.org). You can, for example, subscribe to real-time data in Streams, produce new data to Streams, and create new Streams.

This library is work-in-progress and doesn't provide wrapper functions for all the endpoints in the Streamr API. Currently it covers producing and subscribing to data as well as manipulating Stream objects.

The client uses websockets for streaming message delivery. It should work in all modern browsers.

### Installation

The client is available on [npm](https://www.npmjs.com/package/streamr-client) and can be installed simpy by:

`npm install streamr-client`

### Usage

Here are some quick examples. More detailed examples for the browser and node.js can be found [here](https://github.com/streamr-dev/streamr-client/tree/master/examples).

#### Creating a StreamrClient instance

```javascript
var client = new StreamrClient({
    // See below for more options
    apiKey: 'your-api-key'
})
```

#### Subscribing to real-time events in a stream

```javascript
var sub = client.subscribe(
    {
        stream: 'streamId',
        apiKey: 'secret',       // Optional. If not given, uses the apiKey given at client creation time.
        partition: 0,           // Optional, defaults to zero. Use for partitioned streams to select partition.
        // optional resend options here
    },
    function(message, metadata) {
        // This is the message handler which gets called for every incoming message in the Stream.
        // Do something with the message here!
    }
)
```

#### Programmatically creating a Stream

```javascript
client.getOrCreateStream({
    name: 'My awesome Stream created via the API',
})
    .then((stream) => {
        console.log('Stream ' + stream.id + 'has been created!')
        // Do something with the Stream
    })
```

#### Producing data points to a Stream

```javascript
// Here's our example data point
var msg = {
    temperature: 25.4,
    humidity: 10,
    happy: true
}

// Produce using the Stream id only
client.produceToStream('my-stream-id', msg)

// Or alternatively, via the Stream object (from e.g. getOrCreateStream)
stream.produce(msg)
```

### Client options

Option | Default value | Description
------ | ------------- | -----------
url | wss://www.streamr.com/api/v1/ws | Address of the Streamr websocket endpoint to connect to.
restUrl | https://www.streamr.com/api/v1/ws | Base URL of the Streamr REST API.
apiKey | null | Define a default apiKey to use when none is specified in the individual function calls.
autoConnect | true | If set to `true`, the client connects automatically on the first call to `subscribe()`. Otherwise an explicit call to `connect()` is required.
autoDisconnect | true  | If set to `true`, the client automatically disconnects when the last stream is unsubscribed. Otherwise the connection is left open and can be disconnected explicitly by calling `disconnect()`.

### Message handler callback

The second argument to `client.subscribe(options, callback)` is the callback function that will be called for each message as they arrive. Its arguments are as follows:

Argument | Description
-------- | -----------
message  | A javascript object containing the message itself
metadata | Metadata for the message, for example `metadata.timestamp` etc.

### StreamrClient object

#### Connecting

Name | Description
---- | -----------
connect() | Connects to the server, and also subscribes to any streams for which `subscribe()` has been called before calling `connect()`.
disconnect() | Disconnects from the server, clearing all subscriptions.
pause() | Disconnects from the server without clearing subscriptions.

#### Managing subscriptions

Name | Description
---- | -----------
subscribe(options, callback) | Subscribes to a stream. Messages in this stream are passed to the `callback` function. See below for subscription options. Returns a `Subscription` object.
unsubscribe(Subscription) | Unsubscribes the given `Subscription`.
unsubscribeAll(`streamId`) | Unsubscribes all `Subscriptions` for `streamId`.
getSubscriptions(`streamId`) | Returns a list of `Subscriptions` for `streamId`.

#### Stream API

All the below functions return a Promise which gets resolved with the result. They can also take an `apiKey` as an extra argument. Otherwise the `apiKey` defined in the `StreamrClient` options is used, if any.

Name | Description
---- | -----------
getStream(streamId) | Fetches a Stream object from the API.
listStreams(query) | Fetches an array of Stream objects from the API. For the query params, consult the API docs.
getStreamByName(name) | Fetches a Stream which exactly matches the given name.
createStream(properties) | Creates a Stream with the given properties. For more information on the Stream properties, consult the API docs.
getOrCreateStream(properties) | Gets a Stream with the id or name given in `properties`, or creates it if one is not found.
produceToStream(streamId, message) | Produces a new message (data point) to the given Stream.

#### Listening to state changes of the client 

on(eventName, function) | Binds a `function` to an event called `eventName`
once(eventName, function) | Binds a `function` to an event called `eventName`. It gets called once and then removed.
removeListener(eventName, function) | Unbinds the `function` from events called `eventName`

### Stream object

All the below functions return a Promise which gets resolved with the result. They can also take an `apiKey` as an extra argument. Otherwise the `apiKey` defined in the `StreamrClient` options is used, if any.

Name | Description
---- | -----------
update() | Updates the properties of this Stream object by sending them to the API.
delete() | Deletes this Stream.
getPermissions() | Returns the list of permissions for this Stream.
detectFields() | Updates the Stream field config (schema) to match the latest data point in the Stream.
produce(message) | Produces a new message (data point) to this Stream.

### Subscription options

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

Name | Description
---- | -----------
stream    | Stream id to subscribe to
apiKey   | User key or stream key that authorizes the subscription. If defined, overrides the client's `apiKey`.
partition | Partition number to subscribe to. Defaults to the default partition (0).
resend_all | Set to `true` if you want all the messages for the stream resent from the earliest available message.
resend_last | Resend the previous `N` messages.
resend_from | Resend from a specific message number.
resend_from_time | Resend from a specific Date (or millisecond timestamp).
resend_to | Can be used in conjunction with `resend_from` to limit the end of the resend. By default it is the newest message.

### Binding to events

The client and the subscriptions can fire events as detailed below. You can bind to them using `on`:

```javascript
    // The StreamrClient emits various events
	client.on('connected', function() {
	    console.log('Yeah, we are connected now!')
	})

    // So does the Subscription object
	var sub = client.subscribe(...)
	sub.on('subscribed', function() {
		console.log('Subscribed to '+sub.streamId)
	})
```

### Events on the StreamrClient instance

Name | Handler Arguments | Description
---- | ----------------- | -----------
connected |  | Fired when the client has connected (or reconnected).
disconnected |  | Fired when the client has disconnected (or paused).

### Events on the Subscription object

Name | Handler Arguments | Description
---- | ----------------- | -----------
subscribed | {from: number} | Fired when a subscription request is acknowledged by the server.
unsubscribed |  | Fired when an unsubscription is acknowledged by the server.
resending |  | Fired when the subscription starts resending.
resent |  | Fired after `resending` when the subscription has finished resending.
no_resend |  | Fired after `resending` in case there was nothing to resend.

### Logging

The Streamr JS client library supports [debug](https://github.com/visionmedia/debug) for logging.

In node.js, start your app like this: `DEBUG=StreamrClient* node your-app.js`

In the browser, include `debug.js` and set `localStorage.debug = 'StreamrClient'`
