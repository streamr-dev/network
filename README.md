# streamr-socketio-server

This app uses socket.io and Node to deliver UI updates or other Kafka messages to client browsers. Used by and included in (as a submodule) `unifina-core`.

# Running

First make sure you have all the dependencies installed:

`npm install`

Example of starting the server in dev:

`node start-server.js --zookeeper dev.unifina:2181 --port 8889`

# Protocol

## Sent by client

Event     | Arguments | Response Event(s) | Description
--------- | -------- | ----------- | ----
subscribe | `{channel: 'id'}` | subscribed, b | Requests that the client be subscribed to a channel/stream from the next published message. Will result in a `subscribed` message, and a stream of `b` (broadcast) messages as they are published.
unsubscribe | `{channel: 'id'}` | unsubscribed | Requests an unsubscribe from the given channel.
resend | `{channel: 'id', sub: 'subId', /*resend-options*/}` | (resending, u, resent) or no_resend | Requests a resend. If there is anything to resend, the server will respond with a `resending` message and the requested `u` (unicast) messages. The resend will end with a `resent` message. If there is nothing to resend, the server will send a `no_resend` message.

For a description of the `resend-options`, see the `streamr-client` documentation.

## Sent by server

Event     | Arguments | Description
--------- | -------- |  ----
`subscribed` | `{channel: 'id'}` | Lets the client know that channels were subscribed to. May contain an `err` key if there was an error while subscribing.
`unsubscribed` | `{channel: 'id'}` | Lets the client know that a channel was unsubscribed. May contain an `err` key if there was an error.
`resending` | `{channel: 'id', sub: 'subId'}` | Informs the client that a resend is starting.
`resent` | `{channel: 'id', sub: 'subId'}` | Informs the client that a resend is complete.
`no_resend` | `{channel: 'id', sub: 'subId'}` | Informs the client that there was nothing to resend.
`b` | `[version, ...]` | Broadcast message. A message addressed to all subscriptions listening on the channel. An array whose first item is the message version, and the rest depends on the version.
`u` | `{m: [version, ...], sub: 'subid'}` | Unicast message. Only intended for the subscription with id `sub`. Message in `m` is just like in the broadcast message.

## Events emitted on server instance

Event     | Arguments | Description
--------- | -------- |  ----
`stream-object-created` | Stream | Emitted when a Stream reference object is created
`stream-object-deleted` | Stream | Emitted when a Stream reference object is deleted
