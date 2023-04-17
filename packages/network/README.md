<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header.png" width="1320" />
  </a>
</p>

# @streamr/network-node

A bare minimum operational Streamr Network node implementation that can be further extended by the user.
Used by package `streamr-client` as the main building block for publishing and subscribing to stream partitions.

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
