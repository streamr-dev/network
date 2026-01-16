<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network/main/packages/sdk/readme-header.png" width="1320" />
  </a>
</p>

# @streamr/node
Broker nodes are Streamr Network nodes that run external to your application. You start up a broker node locally or on a
server, and interface with it remotely using one of the supported protocols.

The broker node ships with protocol support for HTTP, WebSocket, and MQTT. As libraries for these common protocols exist
in practically every programming language, you can conveniently publish data to and subscribe to streams in the Streamr Network
using the programming language of your choice.

Broker nodes can also perform other tasks in addition to (or instead of) serving applications, such as mining.

## Table of Contents
- [Install](#install)
- [Run](#run)
- [Configuration](#configuration)
- [Plugins](#plugins)

## Install
```
npm install -g @streamr/node
```

For more information on the different ways of setting up a broker node, see
[setting up a Broker node](https://streamr.network/docs/streamr-network/installing-broker-node).

## Run

First [install](#install) the package globally if you have not yet.

Create a configuration file with interactive tool:
```
streamr-node-init
```
Then run the command broker with the desired configuration file:
```
streamr-node <configFile>
```

## Configuration

See [configuration](configuration.md) for a description of the configuration options.

## Plugins

The broker node ships with a number of plugins that can be enabled and configured selectively to match your specific
needs. For easy data integration from any programming language environment, plugins for HTTP, WebSocket, and MQTT are
provided.

Read more about available [plugins](plugins.md).
