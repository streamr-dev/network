# @streamr/dht

A connectionful Kademlia based P2P distributed hash table (DHT). Implements an in-memory key-value data store where multiple creators of data store values behind a single key. The library is entirely browser compatible.

All communication between peers utilizes [protobuf](https://protobuf.dev/), transported with the help of the custom `@streamr/proto-rpc` library.

Connections in the DHT are established using WebSocket or WebRTC connections. The nodes will decide internally based on peers' connectivity information which connection types to use.

The DHT also provides an interface for sending messages from peer to peer with the `DhtNode#send` function. The sent message is routed over the network to the target node.

## Running a node

Running a bare DhtNode in the Streamr Network is heavily discouraged as it requires advanced configuration. However, if you do wish to run a node here are some recommended configurations.

(the following values are examples. For working production or test values check the @streamr/sdk default network configuration)

```js
const DhtNode = new DhtNode({
  // Add a list of known entry points to the network
  entryPoints: [{
    kademliaId: new Uint8Array([1, 2, 3])
  }], 
  // a list of STUN and TURN servers. Critically important when opening webrtc connections behind NATs.
  iceServers: [{
    url: "stun.l.google.com",
    port: 19302
  }],
  // A range of ports that the node will attempt to start a WebSocket server in. If you wish to use an exact port give equal values to min and max. If left unspecified the node will start without a server.
  websocketPortRange: {
    min: 30000,
    max: 30500
  },
  ...
})
```

## WebSocket Server TLS configuration

Setting up TLS is important if you wish to allow nodes running in the browser to connect to your node over websocket. If left unconfigured webrtc connections will be used in such cases.

There two ways to configure TLS for a DhtNode's WS server.

### Auto-certification

When starting a node configure it to automatically fetch TLS certificates for a randomly generated domain name as such:

```js
const DhtNode = new DhtNode({
  ...
  websocketServerEnableTls: true,
  autoCertifierUrl: 'http://example-autocertifier-url:30000/',
  autoCertifierConfigFile: '~/.streamr/certificate.json'
  ...
})
```

### Custom TLS configuration

If you have your own domain name and/or TLS certificates you can configure the node to use them as follows:

```js
const DhtNode = new DhtNode({
  tlsCertificate: {
    certFileName: 'path/to/file'
    privateKeyFileName: 'path/to/file'
  },
  websocketHost: 'custom-domain.com' // If using a custom domain name give it here to ensure that connectivity checking is correctly pointed to the server 
})
```

### Setting up a custom DHT network

To setup a custom DHT network outside the Streamr Networks Amoy or Polygon environments, you simply need to set up one or multiple entry point DhtNodes to the network and point all newly joining DhtNodes to them. It is also a good idea to configure the entry points to know each other. This makes it possible to restart them without causing network partitioning.

## Development

### local testing and development setup

When running a node for testing or development a few configurations are important.

```js
const DhtNode = new DhtNode({
  entryPoints: [], // Point this to your local dev entry point!
  iceServers: [], // Keep empty to ensure webrtc connections are local
  webrtcAllowPrivateAddresses: true, // Make sure that the value is true in local development
  websocketServerEnableTls: false, // Keep as false to ensure that auto-certification is not attempted
  websocketHost: '127.0.0.1', // Use 127.0.0.1 instead of localhost during development! 
})
```

### Generating Protobuf code

After making changes to the protobuf definitions you should regenerate the protobuf code with the following command.

```bash
  npm run generate-protoc-code
  # Or
  ./proto.sh
```

## Running DHT simulations

Generate test data

```bash
npm run prepare-dht-simulation
```

Run simulation

```bash
npm run run-dht-simulation
```

In order to change number of nodes, or other simulation settings,

* Edit the chages to the file 'test/simulation/data/generatedhtids.ts'.
* Then generate new test data by running 'npm run prepare-dht-simulation'
* Edit the same changes to file 'src/simulation/DhtSimulation.ts'
* Run the simulation with new settings using 'npm run run-dht-simulation '
