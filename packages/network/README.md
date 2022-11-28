<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header.png" width="1320" />
  </a>
</p>

# @streamr/network-node

An extendable Streamr Network node implementation. The package implements and exports a fully-operational
minimal network node implementation that can be further refined by the library's user. It is used as the main building
block in `streamr-client` for publishing and subscribing to streams.

## Table of Contents
- [Install](#install)
- [Develop](#develop)

## Install
```
npm install @streamr/network-node
```

## Develop

### Adjust log level of `node-datachannel`

```
NODE_DATACHANNEL_LOG_LEVEL=[Verbose|Debug|Info|Warning|Error|Fatal]
```

### Regenerate self-signed certificate fixture
To regenerate self signed certificate in `./test/fixtures` run:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 36500 -nodes -subj "/CN=localhost"
```
