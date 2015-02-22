# streamr-socketio-server
This app uses socket.io and Node to deliver UI updates or other Kafka messages to client browsers. Used by and included in (as a submodule) `unifina-core`.

# Running

First make sure you have all the dependencies installed:

`npm install`

Example of starting the server in dev:

`node start-server.js --zookeeper dev.unifina:2181 --port 8889`
