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
subscribe | `{stream: 'id', partition: 0}` | subscribed, b | Requests that the client be subscribed to a `stream` from the next published message. The `partition` is optional and defaults to 0. Will result in a `subscribed` message, and a stream of `b` (broadcast) messages as they are published.
unsubscribe | `{stream: 'id', partition: 0}` | unsubscribed | Requests an unsubscribe from the given `stream`. The `partition` is optional and defaults to 0.
resend | `{stream: 'id', partition: 0, sub: 'subId', /*resend-options*/}` | (resending, u, resent) or no_resend | Requests a resend for a `stream`. The `partition` is optional and defaults to 0. If there is anything to resend, the server will respond with a `resending` message and the requested `u` (unicast) messages. The resend will end with a `resent` message. If there is nothing to resend, the server will send a `no_resend` message.

For a description of the `resend-options`, see the [Javascript client](https://github.com/streamr-dev/streamr-client) documentation.

## Sent by server

Event     | Arguments | Description
--------- | -------- |  ----
`subscribed` | `{stream: 'id', partition: 0}` | Lets the client know that streams were subscribed to. May contain an `error` key if there was an error while subscribing.
`unsubscribed` | `{stream: 'id', partition: 0}` | Lets the client know that a stream was unsubscribed. May contain an `error` key if there was an error.
`resending` | `{stream: 'id', partition: 0, sub: 'subId'}` | Informs the client that a resend is starting.
`resent` | `{stream: 'id', partition: 0, sub: 'subId'}` | Informs the client that a resend is complete.
`no_resend` | `{stream: 'id', partition: 0, sub: 'subId'}` | Informs the client that there was nothing to resend.
`b` | `[version, ...]` | Broadcast message. A message addressed to all subscriptions listening on the stream. An array whose first item is the message version, and the rest depends on the version.
`u` | `{m: [version, ...], sub: 'subid'}` | Unicast message. Only intended for the subscription with id `sub`. Message in `m` is just like in the broadcast message.

## Events emitted on server instance

Event     | Arguments | Description
--------- | -------- |  ----
`stream-object-created` | Stream | Emitted when a Stream reference object is created
`stream-object-deleted` | Stream | Emitted when a Stream reference object is deleted
