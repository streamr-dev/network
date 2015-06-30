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
subscribe | `{channel: 'id', from:number}` | subscribed, ui | Requests that the client be subscribed to a channel/stream from message number `from`. If `from` is not given, subscribes from the next published message. Will result in a `subscribed` message, and a stream of `ui` messages as they are published.
unsubscribe | `{channel: 'id'}` | unsubscribed | Requests an unsubscribe from the given channel.
resend | `{channel: 'id', sub: 'subId', /*resend-options*/}` | (resending, ui, resent) or no_resend | Requests a resend. If there is anything to resend, the server will respond with a `resending` message and the requested `ui` messages. The resend will end with a `resent` message. If there is nothing to resend, the server will send a `no_resend` message.

For a description of the `resend-options`, see the `streamr-client` documentation.

## Sent by server

Event     | Arguments | Description
--------- | -------- |  ----
`subscribed` | `{channel: 'id', from: number}` | Lets the client know that channels were subscribed to, and `from` indicates the message number to expect next. May contain an `err` key if there was an error while subscribing.
`unsubscribed` | `{channel: 'id'}` | Lets the client know that a channel was unsubscribed. May contain an `err` key if there was an error.
`resending` | `{channel: 'id', sub: 'subId', from:number, to:number}` | Informs the client that a resend is starting.
`resent` | `{channel: 'id', sub: 'subId', from:number, to:number}` | Informs the client that a resend is complete. The message will not contain the `from` and `to` fields if there was nothing to resend.
`no_resend` | `{channel: 'id', sub: 'subId', next:number}` | Informs the client that there was nothing to resend. For convenience, the next available message number is given as `next`.
`ui` | `{_S:'id', _C:number, ...` | Contains an object intended for the message recipient. Contains the keys `_S` identifying the stream and `_C` the counter (message sequence number)
