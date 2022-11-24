<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header.png" width="1320" />
  </a>
</p>

# @streamr/network-node

An extendible implementation of the server-side
[Streamr Protocol](https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md) logic written in TypeScript.
The package mostly acts as a library for other packages wishing to implement a broker node, but additionally
provides a full tracker executable, and a stripped-down network node executable.


The primary executable for running a broker node in the Streamr Network resides in the
[streamr-broker](https://github.com/streamr-dev/network-monorepo/packages/broker) package. Although _@streamr/network-node_ contains a
fully-operational minimal network node implementation, we recommend running the node executable found in
_streamr-broker_ as it includes useful client-facing features for interacting with the Streamr Network.

[@streamr/network-tracker](https://github.com/streamr-dev/network-monorepo/packages/network-tracker) contains the code repository
to develop and run the Trackers required by the Network Nodes for peer discovery.

The [wiki](https://github.com/streamr-dev/network/wiki) outlines the technical and architectural
decisions of the project. It provides thorough explanations of some the more involved features.
A glossary is also included.

[API Documentation](https://streamr-dev.github.io/network/)

## Table of Contents
- [Install](#install)
- [Run](#run)
- [Develop](#develop)
- [Release](#release)

## Install

Prerequisites are [Node.js](https://nodejs.org/) `14.x` and npm version `>=6.14`.

You can install @streamr/network-node as a library in your project using npm:

```bash
npm install @streamr/network-node --save
```

To install @streamr/network-node system-wide:
```bash
npm install @streamr/network-node --global
```

## Run

Run an example network of 100 nodes (locally):

    npm run network

## Develop

Install dependencies:

    npm ci

Run the tests:

    npm run test

To build project:

    npm run build

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

To get logs from the internal node-datachannel library:

    NODE_DATACHANNEL_LOG_LEVEL=[Verbose|Debug|Info|Warning|Error|Fatal]

    By default: NODE_DATACHANNEL_LOG_LEVEL=Fatal

### Regenerate self-signed certificate fixture
To regenerate self signed certificate in `./test/fixtures` run:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 36500 -nodes -subj "/CN=localhost"
```
