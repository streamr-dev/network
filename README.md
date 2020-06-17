# Streamr network 
 ![Travis](https://travis-ci.com/streamr-dev/network.svg?token=qNNVCnYJo1fz18VTNpPZ&branch=master)
 
> Peer-to-peer publish-subscribe network for real-time data with support for long-term data persistence

This repository/package contains an extendable implementation of the
[Streamr protocol](https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md) written in Node.js.
The code contains a tracker implementation and a minimal network node implementation.
This package acts as a library for other Node.js packages, but also provides a few of its own executables as well.


The main executable for running a broker node in the Streamr Network resides in the
[Broker](https://github.com/streamr-dev/broker) repository. Although this repository does contain a
fully-operational minimal network node implementation, we recommend running the broker node because it includes
useful client-facing features for interacting with the Streamr Network. 

The [wiki](https://github.com/streamr-dev/network/wiki) of this project outlines the technical and architectural
decisions made during development. It also provides explanations of some the more involved features. There is also a
glossary for often used terms. We aim to keep the wiki updated regularly so it is an accurate reflection of the code
base.

## Table of Contents
- [Installation](#installation)
- [Architectural decisions](https://github.com/streamr-dev/network/wiki)
- [Examples](#examples)
- [Development](#development)
- [Releasing](#releasing)

## Installation

Prerequisites: [Node.js](https://nodejs.org/) (`>=^13.11.0`), npm version 6.14.2.

You can install Streamr Network using npm:

```
$ npm install streamr-network --save
```

It is also possible to install Streamr Network globally (using `npm install streamr-network --global`)

## Examples

Check the [examples folder](./examples) for examples of using the network node in different settings. Examples include:
typical pub/sub setting, and publishing and subscribing using MQTT.

## Development

Install dependencies:

    npm ci
    
Run the tests:

    npm run test

Run an example network locally (10 nodes):

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
    
    
## Publishing

Publishing to NPM is automated via Github Actions. Follow the steps below to publish `latest` or `beta`.

### Publishing `latest`:
1. Update version with either `npm version [patch|minor|major]`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created. 
2. `git push --follow-tags`
3. Wait for Github Actions to run tests
4. If tests passed, Github Actions will publish the new version to NPM

### Publishing `beta`:
1. Update version with either `npm version [prepatch|preminor|premajor] --preid=beta`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created. 
2. `git push --follow-tags`
3. Wait for Github Actions to run tests
4. If tests passed, Github Actions will publish the new version to NPM
