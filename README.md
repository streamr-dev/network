# Streamr network 
 ![Travis](https://travis-ci.com/streamr-dev/network.svg?token=qNNVCnYJo1fz18VTNpPZ&branch=master)
 
> P2P network for the real-time data with storage support

This Node.js project implements
[Streamr protocol](https://github.com/streamr-dev/streamr-client-protocol-js).
It allows you to publish any kind of data, subscribe and store in network.
Flexible architecture allows you to integrate any external data sources.
Check [Examples](#examples) for more information. Project still in progress, 
check [Roadmap](#roadmap) for more information.


## Table of Contents
- [Demo](#demo)
- [Installation](#installation)
- [Integration](#integration)
- [Getting started](#getting-started)
- [Advanced integrations](#advanced-integrations)
- [Architectural decisions](https://github.com/streamr-dev/network/wiki)
- [Component reference](#component-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Releasing](#releasing)

## Demo

Follow installation instructions in [Network runner](https://github.com/streamr-dev/network-runner).
![Screenshot of the demo running](https://raw.githubusercontent.com/streamr-dev/network-runner/master/streamr-network.png?token=ABWG2RMLCBIRYNCUUTOF2Z24ZLWT6)

## Installation

Prerequisites: [Node.js](https://nodejs.org/) (`^8.10.0`, `^10.13.0`, or `>=11.10.1`), npm version 6+.

You can install Streamr Network using npm:

```
$ npm install @streamr/streamr-p2p-network --save
```

It is also possible to install Streamr Network globally (using `npm install @streamr/streamr-p2p-network --global`)

## Integration

Integration into existing project could be found in [Examples](./examples)

## Getting started

TODO

## Roadmap

TODO

## Advanced integrations

TODO

## Component reference

TODO

## Examples

Check our [examples folder](./examples)

## Troubleshooting

TODO

## Development

Install dependencies:

    npm ci
    
Run the tests:

    npm run test

Run example of network (10 nodes):

    npm run network

We use [eslint](https://github.com/eslint/eslint) for code formatting:

    npm run eslint

Code coverage:

    npm run coverage
    
Debugging:

To get all Streamr Network debug messages  

    export DEBUG=streamr:*
    
Or adjust debugging to desired level 

- connection layer `export DEBUG=streamr:connection:*`
- logic layer `export DEBUG=streamr:logic:*`
- protocol layer `export DEBUG=streamr:protocol:*`

Excluding level

    export DEBUG=streamr:*,-streamr:connection:*
    
    
## Releasing

To release a new version of network onto NPM

1. Update version with either `npm version patch`, `npm version minor`, or `npm version major`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created. 
2. `git push --follow-tags`
3. Wait for Travis CI to run tests and to publish to npm if successful.
