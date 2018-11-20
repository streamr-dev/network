[![Build Status](https://travis-ci.org/streamr-dev/data-api.svg?branch=master)](https://travis-ci.org/streamr-dev/data-api)

# Data API

An essential service of the Streamr cloud architecture responsible for inbound and outbound data to/from Streamr
cloud. Provides HTTP and WebSocket APIs for producing data to and listening to data from Streamr. All external and 3rd
party data communication with Streamr flows through this service.

![Where Data API sits in Streamr cloud stack](high-level.png)

## Building
Project uses npm for package management.

- Start off by installing required dependencies with `npm install`
- To run tests `npm test`

## Running
In most cases, you will want to run this service as a [pre-built Docker image](https://hub.docker.com/r/streamr/data-api/).
See https://github.com/streamr-dev/streamr-docker-dev for more information on how to run the Streamr cloud architecture.

If you are developing this service in particular, or are otherwise inclined, you can run this service with `npm run`.

## Publishing
A [Docker image](https://hub.docker.com/r/streamr/data-api/) is automatically built and pushed to DockerHub when commits
are pushed to branch `master`.

Currently project has no CI system configured nor are any packages published to npmjs.com. 

## API Specification

For production version refer to https://www.streamr.com/help/api#datainput and https://www.streamr.com/help/api#dataoutput.

Otherwise see [APIDOC.md](APIDOC.md).

## Protocol Specification

Internal messaging protocol is described in [PROTOCOL.md](PROTOCOL.md).

## License

This software is open source, and dual licensed under [AGPLv3](https://www.gnu.org/licenses/agpl.html) and an enterprise-friendly commercial license.
