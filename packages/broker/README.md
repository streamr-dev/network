<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header-img.png" width="1320" />
  </a>
</p>

# streamr-broker
Broker nodes are Streamr nodes that run externally to your application. You start up a node on a server, and interface with it remotely using one of the supported protocols.

The Broker node ships with plugins for HTTP, Websocket, and MQTT protocols. Libraries for these protocols exist in practically every programming language, meaning that you can conveniently publish and subscribe to data from the Streamr Network using any programming language.

Broker nodes have a plugin architecture that allows them to perform other tasks in addition to (or instead of) serving applications, such as mining.

## Table of Contents
- [Install](#install)
- [Plugins](#plugins)
- [Run](#run)
- [Develop](#develop)

## Install
| NodeJS version `16.13.x` and NPM version `8.x` is required |
| --- |

To install streamr-broker:
```bash
npm install -g streamr-broker
```

For more information on the different ways to install a Broker node, see [setting up a Broker node](https://streamr.network/docs/streamr-network/installing-broker-node).

## Plugins

The Broker node ships with a number of plugins for configuring your Broker node to match your specific needs. For easy data integration from any environment, plugins for HTTP, Websocket, and MQTT are provided. 

Read more about available [plugins](plugins.md).

## Run

First install the package
```
npm install -g streamr-broker
```
Create a configuration file with interactive tool:
```
streamr-broker-init 
```
Then run the command broker with the desired configuration file
```
streamr-broker <configFile>
```

## Develop

Check the [Broker dev notes](develop.md) if you're intending to contribute to the codebase.
