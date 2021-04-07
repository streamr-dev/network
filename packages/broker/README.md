# streamr-broker

Main executable for running a broker node in Streamr Network.

The broker node extends the minimal network node provided by the
[streamr-network](https://github.com/streamr-dev/network) library with
- client-facing support for foreign protocols (e.g. HTTP, MQTT) via adapters
- support for long-term persistence of data using Apache Cassandra.

## Table of Contents
- [Install](#install)
- [Run](#run)
- [Develop](#develop)
- [Release](#release)
- [Misc](#misc)

## Install

Prerequisites are [Node.js](https://nodejs.org/) `14.x` and npm version `>=6.14`.

To install streamr-broker:
```bash
npm install streamr-broker --global
```

## Run
It is convenient to run a broker node as part of the full Streamr stack. Check out
the [streamr-docker-dev](https://github.com/streamr-dev/streamr-docker-dev) tool
that can be used to run the full Streamr stack.

If instead you want to run a broker node by itself without Docker, follow the steps below.

First install the package
```
npm install streamr-broker --global
```
Then run the command broker with the desired configuration file
```
broker <configFile>
```
See folder "configs" for example configurations. To run a simple local broker
```
broker configs/development-1.env.json
```
Then run the command tracker with default values
```
tracker
```

### Deleting expired data from Storage node
To delete expired data from storage node run

```
broker <configFile> --deleteExpired
```

or

```
node app.js <configFile> --deleteExpired
```

## Develop

Install dependencies:

    npm ci

Run the tests:

    npm run test

We use [eslint](https://github.com/eslint/eslint) for code formatting:

    npm run eslint

Code coverage:

    npm run coverage

### Debug

To get all debug messages:

    LOG_LEVEL=debug

... or adjust debugging to desired level:

    LOG_LEVEL=[debug|info|warn|error]

To disable all logs

    NOLOG=true

### Regenerate self-signed certificate fixture
To regenerate self-signed certificate in `./test/fixtures` run:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 36500 -nodes -subj "/CN=localhost"
```

## Release

Publishing to NPM is automated via GitHub Actions. Follow the steps below to publish.

1. `git checkout master && git pull`
2. Update version with either `npm version patch`, `npm version minor`, or `npm version major`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created.
3. `git push --follow-tags`
4. Wait for GitHub Actions to run tests
5. If tests passed, GitHub Actions will publish the new version to NPM

## Misc

### API Specification

For production version of the Streamr API refer to [API Explorer](https://api-explorer.streamr.com).

### Special considerations for using MQTT adapter
- For authentication put API_KEY in the password connection field
- MQTT clients can send plain text, but their payload will be transformed to a JSON object accordingly:
`{"mqttPayload":"ORIGINAL_PLAINTEXT_PAYLOAD}`

#### Error handling
- If API_KEY is not correct, client will receive "Connection refused, bad user name or password" (returnCode: 4)
- If stream is not found, client will receive "Connection refused, not authorized" (returnCode: 5)
