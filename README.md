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
subscribe | `[{channel: 'id', options: { ... }}, ...]` | subscribed, expect, resent, ui | Requests that the client be subscribed to certain streams/channels. Will result in a `subscribed` message, then an `expect` message, possibly a series of `ui` messages, a `resent` message, and then further `ui` messages.
unsubscribe | `{channels: ['id1', ...]}` | unsubscribed | Requests an unsubscribe from the given channels. If multiple channels are given, results in multiple `unsubscribed` messages.
resend | `{channel: 'id', from: number, to: number}` | ui, resent | Requests a resend

## Sent by server

Event     | Arguments | Description
--------- | -------- |  ----
`subscribed` | `{channels: ['id', 'id2']}` | Lets the client know that channels were subscribed to. May contain an `err` key if there was an error while subscribing.
`unsubscribed` | `{channel: 'id'}` | Lets the client know that a channel was unsubscribed. May contain an `err` key if there was an error.
`expect` | `{channel: 'id', from: number}` | Informs the client about what the next expected message number is. 
`resent` | `{channel: 'id', from:number, to:number}` | Informs the client that a resend is complete. If the `from` and `to` keys are undefined, there is nothing to resend.
`ui` | `{_S:'id', _C:number, ...` | Contains an object intended for the message recipient. Contains the keys `_S` identifying the stream and `_C` the counter (message sequence number)

