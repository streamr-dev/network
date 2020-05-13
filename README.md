# Broker

Main executable for running a broker node in Streamr Network.

The broker node extends the minimal network node provided by the
[network library](https://github.com/streamr-dev/network) with
- client-facing support for foreign protocols (e.g. HTTP, MQTT) via adapters
- support for long-term persistence of data via Apache Cassandra.

## Developing
Project uses npm for package management.

- Start off by installing required dependencies with `npm ci`
- To run tests `npm test`

## Running
It is convenient to run a broker node as part of the full Streamr stack.
To run a copy of the full Streamr stack, see the
[streamr-docker-dev](https://github.com/streamr-dev/streamr-docker-dev) tool.

If instead you want to run a broker node by itself without Docker, follow the steps below.

First install the package
```
npm install -g streamr-broker
```
Then run the command broker with the desired configuration file
```
broker <configFile>
```
See folder "configs" for example configurations, e.g., to run a simple local broker
```
broker configs/development-1.env.json
```
Then run the command tracker with default values
```
tracker
```


## Publishing

Publishing to NPM is automated via Travis CI. Follow the steps below to publish.

1. Update version with either `npm version patch`, `npm version minor`, or `npm version major`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created. 
2. `git push --follow-tags`
3. Wait for Travis CI to run tests
4. If tests passed, Travis CI will publish the new version to NPM

## API Specification

For production version refer to [API Explorer](https://api-explorer.streamr.com).

## Protocol Specification

Messaging protocol is described in [streamr-specs PROTOCOL.md](https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md).

## MQTT special considerations
- MQTT topic names are mapped to stream names (and *not* stream ids.) This behavior may change in the future.
- For authentication put API_KEY in password connection field
- MQTT native clients are able to send plain text, but their payload will be transformed to JSON
`{"mqttPayload":"ORIGINAL_PLAINTEXT_PAYLOAD}`

## Generating fixture self signed certificate
To regenerate self signed certificate in `./test/fixtures` run:

``
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 36500 -nodes -subj \'/CN=localhost\'
``

Error handling:
- If API_KEY is not correct, client will receive "Connection refused, bad user name or password" (returnCode: 4)
- If stream is not found, client will receive "Connection refused, not authorized" (returnCode: 5)
