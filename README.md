[![Build Status](https://travis-ci.com/streamr-dev/streamr-client-javascript.svg?branch=master)](https://travis-ci.com/streamr-dev/streamr-client-javascript)

## Streamr JavaScript Client

By using this client, you can easily interact with the [Streamr](http://www.streamr.com) API from JavaScript-based environments, such as browsers and [node.js](https://nodejs.org). You can, for example, subscribe to real-time data in Streams, produce new data to Streams, and create new Streams.

This library is work-in-progress and doesn't provide wrapper functions for all the endpoints in the Streamr API. Currently it covers producing and subscribing to data as well as manipulating Stream objects.

The client uses websockets for producing and consuming messages to/from streams. It should work in all modern browsers.

### Installation

The client is available on [npm](https://www.npmjs.com/package/streamr-client) and can be installed simpy by:

`npm install streamr-client`

### Usage

Here are some quick examples. More detailed examples for the browser and node.js can be found [here](https://github.com/streamr-dev/streamr-client/tree/master/examples).

#### Creating a StreamrClient instance

```javascript
const client = new StreamrClient({
    // See below for more options
    auth: {
        apiKey: 'your-api-key'
    }
})
```

#### Subscribing to real-time events in a stream

```javascript
const sub = client.subscribe(
    {
        stream: 'streamId',
        apiKey: 'secret',       // Optional. If not given, uses the apiKey given at client creation time.
        partition: 0,           // Optional, defaults to zero. Use for partitioned streams to select partition.
        // optional resend options here
    },
    (message, metadata) => {
        // This is the message handler which gets called for every incoming message in the Stream.
        // Do something with the message here!
    }
)
```

#### Resending historical data 

```javascript
const sub = await client.resend(
    {
        stream: 'streamId',
        resend: {
            last: 5,
        },
    },
    (message) => {
        // This is the message handler which gets called for every received message in the Stream.
        // Do something with the message here!
    }
)
```

See "Subscription options" for resend options


#### Programmatically creating a Stream

```javascript
client.getOrCreateStream({
    name: 'My awesome Stream created via the API',
})
    .then((stream) => {
        console.log(`Stream ${stream.id} has been created!`)
        // Do something with the Stream, for example call stream.publish(message)
    })
```

#### Publishing data points to a Stream

```javascript
// Here's our example data point
const msg = {
    temperature: 25.4,
    humidity: 10,
    happy: true
}

// Publish using the Stream id only
client.publish('my-stream-id', msg)

// Or alternatively, via the Stream object (from e.g. getOrCreateStream)
stream.publish(msg)

// Publish with a specific timestamp as a Date object (default is now)
client.publish('my-stream-id', msg, new Date(54365472))

// Publish with a specific timestamp in ms
client.publish('my-stream-id', msg, 54365472)

// Publish with a specific timestamp as a ISO8601 string
client.publish('my-stream-id', msg, '2019-01-01T00:00:00.123Z')

// Publish with a specific partition key (default is null which will publish to stream partition 0)
client.publish('my-stream-id', msg, Date.now(), 'my-partition-key')
```

### Client options

Option | Default value | Description
------ | ------------- | -----------
url | wss://www.streamr.com/api/v1/ws | Address of the Streamr websocket endpoint to connect to.
restUrl | https://www.streamr.com/api/v1 | Base URL of the Streamr REST API.
auth | {} | Object that can contain different information to authenticate. More details below.
publishWithSignature | 'auto' | Determines if data points published to streams are signed or not. Possible values are: 'auto', 'always' and 'never'. Signing requires `auth.privateKey` or `auth.provider`.  'auto' will sign only if one of them is set. 'always' will throw an exception if none of them is set.
verifySignatures | 'auto' | Determines under which conditions signed and unsigned data points are accepted or rejected. 'always' accepts only signed and verified data points. 'never' accepts all data points. 'auto' verifies all signed data points before accepting them and accepts unsigned data points only for streams not supposed to contain signed data.
autoConnect | true | If set to `true`, the client connects automatically on the first call to `subscribe()`. Otherwise an explicit call to `connect()` is required.
autoDisconnect | true  | If set to `true`, the client automatically disconnects when the last stream is unsubscribed. Otherwise the connection is left open and can be disconnected explicitly by calling `disconnect()`.
orderMessages | true | If set to `true`, the subscriber handles messages in the correct order, requests missing messages and drops duplicates. Otherwise, the subscriber processes messages as they arrive without any check.
maxPublishQueueSize | 10000 | Only in effect when `autoConnect = true`. Controls the maximum number of messages to retain in internal queue when client has disconnected and is reconnecting to Streamr.
publisherGroupKeys | {} | Object defining the group key as a hex string used to encrypt for each stream id.
subscriberGroupKeys | {} | Object defining, for each stream id, an object containing the group key used to decrypt for each publisher id.

### Authentication options

Authenticating with an API key (you can manage your API keys in the [Streamr web app](https://www.streamr.com)):
```
new StreamrClient({
    auth: {
        apiKey: 'your-api-key'
    }
})
```
Authenticating with an Ethereum private key by cryptographically signing a challenge (also automatically creates an associated user account):
```
new StreamrClient({
    auth: {
        privateKey: 'your-private-key'
    }
})
```
Authenticating with an Ethereum private key contained in an Ethereum (web3) provider:
```
new StreamrClient({
    auth: {
        provider: web3.currentProvider,
    }
})
```
(Authenticating with an username and password, for internal use by the Streamr app):
```
new StreamrClient({
    auth: {
        username: 'my@email.com',
        password: 'password'
    }
})
```
(Authenticating with a pre-existing session token, for internal use by the Streamr app):
```
new StreamrClient({
    auth: {
        sessionToken: 'session-token'
    }
})
```

### Message handler callback

The second argument to `client.subscribe(options, callback)` is the callback function that will be called for each message as they arrive. Its arguments are as follows:

Argument | Description
-------- | -----------
payload  | A JS object containing the message payload itself
streamMessage | The whole [StreamMessage](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/message_layer/StreamMessage.js) object containing various metadata, for example `streamMessage.getTimestamp()` etc.

### StreamrClient object

#### Connecting

Name | Description
---- | -----------
connect() | Connects to the server, and also subscribes to any streams for which `subscribe()` has been called before calling `connect()`. Returns a Promise. Rejects if already connected or connecting.
disconnect() | Disconnects from the server, clearing all subscriptions. Returns a Promise.  Rejects if already disconnected or disconnecting.
pause() | Disconnects from the server without clearing subscriptions.
ensureConnected() | Safely connects if not connected. Returns a promise. Resolves immediately if already connected. Only rejects if an error occurs during connection.
ensureDisconnected() | Safely disconnects if not disconnected. Returns a promise. Resolves immediately if already disconnected. Only rejects if an error occurs during disconnection.

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
publish(streamId, message) | Publishes a new message (data point) to the given Stream.

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
hasPermission(operation, user) | Returns a permission object, or null if no such permission was found. `operation` is one of 'read', 'write', or 'share'. `user` is the username of a user, or null for public permissions.
grantPermission(operation, user) | Grants the permission to do `operation` to `user`, which are defined as above.
revokePermission(permissionId) | Revokes a permission identified by its `id`.
detectFields() | Updates the Stream field config (schema) to match the latest data point in the Stream.
publish(message) | Publishes a new message (data point) to this Stream.

### Subscription options

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

Name | Description
---- | -----------
stream    | Stream id to subscribe to
partition | Partition number to subscribe to. Defaults to the default partition (0).
resend | Object defining the resend options. Below are examples of its contents.
groupKeys | Object defining the group key as a hex string for each publisher id of the stream.

```javascript
// Resend N most recent messages
resend: {
    last: 10,
}

// Resend from a specific message reference up to the newest message
resend: {
    from: {
        timestamp: 12345,
        sequenceNumber: 0, // optional
    }
    publisher: 'publisherId', // optional
    msgChainId: 'msgChainId', // optional
}

// Resend a limited range of messages
resend: {
    from: {
        timestamp: 12345,
        sequenceNumber: 0, // optional
    },
    to: {
        timestamp: 54321,
        sequenceNumber: 0, // optional
    },
    publisher: 'publisherId', // optional
    msgChainId: 'msgChainId', // optional
}
```

### Binding to events

The client and the subscriptions can fire events as detailed below. You can bind to them using `on`:

```javascript
    // The StreamrClient emits various events
	client.on('connected', () => {
	    console.log('Yeah, we are connected now!')
	})

    // So does the Subscription object
	const sub = client.subscribe(...)
	sub.on('subscribed', () => {
	    console.log(`Subscribed to ${sub.streamId}`)
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
subscribed | | Fired when a subscription request is acknowledged by the server.
unsubscribed | | Fired when an unsubscription is acknowledged by the server.
resending | [ResendResponseResending](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/control_layer/resend_response_resending/ResendResponseResendingV1.js) | Fired when the subscription starts resending. Followed by the `resent` event to mark completion of the resend after resent messages have been processed by the message handler function.
resent | [ResendResponseResent](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/control_layer/resend_response_resent/ResendResponseResentV1.js) | Fired after `resending` when the subscription has finished resending.
no_resend | [ResendResponseNoResend](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/protocol/control_layer/resend_response_no_resend/ResendResponseNoResendV1.js) | This will occur instead of the `resending` - `resent` sequence in case there were no messages to resend.
error | Error object | Reports errors, for example problems with message content

### Logging

The Streamr JS client library supports [debug](https://github.com/visionmedia/debug) for logging.

In node.js, start your app like this: `DEBUG=StreamrClient* node your-app.js`

In the browser, include `debug.js` and set `localStorage.debug = 'StreamrClient'`
