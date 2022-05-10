<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header-img.png" width="1320" />
  </a>
</p>

# streamr-broker

The Broker node is your application's access point to data streams in the Streamr Network. The Broker node is also used for mining and staking.

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

## Plugins

The Broker node ships with a number of plugins for configuring your Broker node to match your specific needs. For easy data integration from any environment, plugins for HTTP, Websocket, and MQTT are provided. Read more about available [plugins](plugins.md).

## Run

First install the package
```
npm install -g streamr-broker
```
Create a configuration file with interactive tool:
```
broker-init 
```
Then run the command broker with the desired configuration file
```
broker <configFile>
```

## Develop

Check the [Broker dev notes](develop.md) if you're intending to contribute to the codebase.
