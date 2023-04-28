---
sidebar_position: 3
---

# Use any language or device

This tutorial will show you how to publish data into the Streamr Network from inside your app by interfacing with a Broker node that you run using the MQTT protocol. MQTT client libraries are available for a huge variety of programming languages but you can also use WebSockets or HTTP if you prefer.

**Prerequisites:**

- NPM v8 or greater
- NodeJS 16.13.x or greater
- MacOS/Linux environments (Windows environments may require minor adjustments)
- A small amount of `MATIC` to pay for gas on Polygon mainnet. You can reachout to us on the #dev channel of [Discord](https://discord.gg/gZAm8P7hK8) for some tokens.
- A MQTT library of your choice (this tutorial uses [MQTT.js](https://www.npmjs.com/package/mqtt))

If you have a Helium setup, you may benefit from reading this blog post first, [Helium x Streamr](https://blog.helium.com/helium-x-streamr-ea89c4b61a14)

## Install & run the Broker node.

You'll need to run a [Streamr Broker node](../streamr-network/nodes#broker-nodes) to connect your app to.

```shell
$ npm i -g streamr-broker
```

Before the Broker node can be started, its configuration files need to be created using the following command:

```shell
$ streamr-broker-init
```

During initiziliation make sure to enable the `mqtt-plugin` and assign a port to it (default is 1883). Other plugins are unnecessary. For more in depth information on installing a Broker node, see the guide on [running a Broker node](https://streamr.network/docs/streamr-network/installing-broker-node).

![image](@site/static/img/mqtt-guide-1.png)

Once the init script is complete you may view your generated configuration file with:

```shell
$ cat ~/.streamr/config/default.json
```

#### Start the Broker node

```shell
$ streamr-broker
```

The node's address (its public key) is displayed when the Broker node is started. Record this as the `BrokerNodeAddress`, it's needed in the next step!

**TODO: Don't include the session key extension.**

## Configure your stream with our js client

Create a folder cd into it and create a package.json by running

```shell
$ npm init
```

The client is available on [NPM](https://www.npmjs.com/package/streamr-client) and can be installed simply with:

```shell
$ npm install streamr-client
```

Having trouble installing the client? Maybe our [troubleshooting](../usage/Streamr%20JS%20Client/how-to-use#Troubleshooting) section will help.

:::note
Make sure the `PRIVATE_KEY` you add has a small amount of `MATIC` (the native token of the Polygon blockchain) in its wallet to pay for gas to create the stream and make the permission assignment.
:::

TODO: ** Create a stream widget **

```ts
// Import the Streamr client
import StreamrClient from 'streamr-client';
const PRIVATE_KEY = '';

// Initialize the client with an Ethereum account
const streamr = new StreamrClient({
  auth: {
    privateKey: PRIVATE_KEY,
  },
});

const stream = await streamr.getOrCreateStream({
  id: '/sensor/firehose',
});
```

#### Assign permission to your Broker node

The Broker node **needs permission to publish data to your stream**. We will be granting the Broker node `PUBLISH` and `SUBSCRIBE` permissions on the stream we just created. This step will consume a small amount of `MATIC` tokens.

:::note
Take care to not confuse `stream` with `streamr` ;)
:::

```ts
await stream.grantPermissions({
  user: BrokerNodeAddress,
  permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE],
});
```

## Push data

In this step we configure the MQTT client to connect and push data to the running Broker node, which will take care of the rest.

#### Authorize your MQTT client to connect with the Broker node

Before your app or device can push data to the Broker node, we will need to provide the `ApiKey` from the Broker node's configuration file. This key can be found here:

```shell
$ cat ~/.streamr/config/default.json
```

```json

{
    ...
    "apiAuthentication": {
        "keys": [
            "ImTheKeyYouAreLookingFor"
        ]
    }
}
```

The following instructions are specific to your choice of MQTT library- this tutorial uses [MQTT.js](https://www.npmjs.com/package/mqtt). There are many valid alternatives including, `async-mqtt`.

In the code sample below, we provide the URL (the IP or address to your Broker node) along with the MQTT port (the default is 1883). To authenticate, use an empty `username` field and enter the `ApiKey` as the `password`.

```ts
// Node.js example

const mqttClient = mqtt.connect('mqtt://localhost:1883', {
  username: '',
  password: ApiKey,
});
```

:::note
For URL authentication, for example `mqtt://"":ApiKey@1.2.3.4:1883`. Some MQTT libraries may have issue with an empty username, to get around this you can provide "x" as the username.
:::

:::note
If you're connecting to the MQTT interface over the open internet, please remember to make sure the port is open.
Technical information about the plugin interface can be found in the [Broker plugin docs](https://github.com/streamr-dev/network-monorepo/blob/main/packages/broker/plugins.md).
:::

#### Start pushing data

With your Broker node running and your MQTT client configured correctly, the final remaining step is to start pushing the data. You will push data by providing a `StreamId` as the first parameter and the JSON payload as the second parameter. The stream ID contains the ethereum addres, i.e. `0x123/sensor/firehose`.

:::info
Push valid JSON! Invalid JSON may silently fail so be sure to run your payload through a JSON validator to double check.
:::

```ts
// Node.js example
const StreamId = stream.id;

await mqttClient.publish(StreamId, JSON.stringify({ foo: bar }));
```

If everything has been configured correctly so far then the data should now be flowing to the Broker node, which will receive and sign the data, then publish it to the to the Streamr Network stream.

At this point, you could use the Streamr [CLI tool](https://github.com/streamr-dev/network-monorepo/tree/main/packages/cli-tools) to subscribe to stream and observe the message flow:

```shell
$ npm install -g @streamr/cli-tools
$ streamr stream subscribe 0x.../sensor/firehose --private-key YOUR_PRIVATE_KEY
```

\*\* Note, if the stream is publicly subscribale, then you can omit the private key flag.

## Bonus: Subscribe to streams

Just like you used the Broker node's MQTT interface to publish data into the network, you can also pull data out of the Network via any Broker nodes interface just as well using the same pattern described in the above steps. Just make sure that the Broker node has `SUBSCRIBE` permission to the stream you are interested in.

Once connected, you can listen for the `message` callback on the MQTT client. The first parameter will be the `StreamId` and the second parameter will contain the message JSON payload:

```ts
// NodeJS example

mqttClient.subscribe(StreamId)
...
mqttClient.on('connect', () => {
    mqttClient.on('message', (StreamId, rawData) => {
        ...
    })
})
```

## Troubleshooting

The most common issues are:

- TODO

To include more verbose logging you could run the Broker with these additional flags:

```shell
$ LOG_LEVEL=trace DEBUG=Streamr* streamr-broker
```

## All done 🎉

Congratulations! You accomplished:

- Running a Broker node on the Streamr Network
- Created a stream and modified its access control
- Published data to the Streamr Network using the MQTT interface of your running Broker node
- Subscribed to flowing data on the Streamr Network using the MQTT interface of your running Broker node

If you had any problems along the way, please drop a message to the core team on the #dev channel of our [Discord](https://discord.gg/gZAm8P7hK8).
