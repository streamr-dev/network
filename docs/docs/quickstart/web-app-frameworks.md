---
sidebar_position: 2
---

# Web app frameworks

In this quickstart guide, you'll be using Streamr in a **ReactJS** web application. You'll be reading from a publicly readable stream. Your ReactJS app will be a consumer (subscriber) of the stream. If you want your app to be able to write data to the stream, then you'll need to grant access to individual users of your app or create a publicly writable stream (the latter is typically not recommended). Publishing is typically accomplished with a centralized gatekeeping service (like a NodeJS server).

**Prerequisites:**

- NPM v8 or greater
- NodeJS 16.13.x or greater
- A basic understanding of ReactJS or NextJS
- A small amount of `MATIC` to pay for gas on Polygon mainnet. You can reachout to us on the #dev channel of [Discord](https://discord.gg/gZAm8P7hK8) for some tokens.

## Setup & installation

#### Installation

First you need to install the Streamr client in your application:

<!-- TODO: add hub video tutorial -->

The client is available on [NPM](https://www.npmjs.com/package/streamr-client) and can be installed simply with:

```shell
$ npm install streamr-client
```

Having trouble installing the client? Maybe our [troubleshooting](../usage/Streamr%20JS%20Client/how-to-use#Troubleshooting) section will help.

## Subscribe to data of a stream

This tutorial shows how to subscribe to a `PUBLIC` [stream](https://streamr.network/marketplace/products/c188a26fc1aa4d6b91772fa4c463cc4968c1156707824a538061baa5a26b3d93/streamPreview/0x8ed334e44265a0c89b7739cb66a8f19675a5fc7a%2Fultrasound.money%2Ffees%2Fburn-categories). The current Ethereum 2.0 burn stats get published onto this stream every minute, and we want to consume this data.

To do that, we must first set up the `StreamrClient`. The `StreamrClient` handles the authentification of your stream interactions. It is needed to see if your user has permission to read from the stream.

In this case, the stream is set to `PUBLIC` (anyone can read). However, since this information gets stored in the Stream registry, which exists inside a smart contract on the Polygon chain, we need a wallet to receive the information.

:::info
By default, your stream will only have the creator address set for permission to read from your stream.
If you have created your own stream, set the `SUBSCRIBE` permission to public or allowlist some addresses so that your users can read data from your stream. Learn more about **[authentification](../usage/authenticate)**.
:::

```ts
import StreamrClient from 'streamr-client';
declare var window: any;

export const startSubscribing = () => {
  const streamId =
    '0x8ed334e44265a0c89b7739cb66a8f19675a5fc7a/ultrasound.money/fees/burn-categories';
  // Add a browser wallet (e.g. Metamask) to check if the address has permission to read the stream
  const streamr = new StreamrClient({
    auth: { ethereum: window.ethereum },
    // if you don't want to make your users connect a wallet use this instead:
    // auth: { privateKey: process.env.PRIVATE_KEY },
  });

  streamr.subscribe(streamId, (message) => {
    console.log(message);
  });
};
```

## Use our React hooks

**If you'd like to use hooks for the Streamr client, checkout the [Streamr React Client](https://www.npmjs.com/package/streamr-client-react).**

Simply install the following packages in your application:

```shell
$ npm install streamr-client streamr-client-react@hkt
```

The `Provider` component holds its own StreamrClient instance and makes it available to all its children components.

Add a private key to your options and have a global StreamrClient instance. It will interact with the desired streams under the hood.

```tsx title="/src/App.tsx"
import Provider from 'streamr-client-react';
import StreamrExample from './streamr-example';

function App() {
  const options = {
    auth: { privateKey: process.env.PRIVATE_KEY },
    // or authenticate with user wallet
    // auth: { ethereum: window.ethereum }
  };

  return (
    <Provider {...options}>
      <StreamrExample></StreamrExample>
    </Provider>
  );
}

export default App;
```

You can now add `useSubscribe` in your components to read from your desired streams. In this case, we are reading from a `PUBLIC` stream to which the current Ethereum 2.0 burn rate is getting streamed.

```tsx title="/src/streamr-example.tsx"
import { useSubscribe } from 'streamr-client-react';

const StreamrExample = () => {
  const streamId =
    '0x8ed334e44265a0c89b7739cb66a8f19675a5fc7a/ultrasound.money/fees/burn-categories';

  useSubscribe(streamId, {
    onMessage: (msg) => {
      console.log(msg.getContent());
    },
  });
  return <h1>Wow! That was easy!</h1>;
};

export default StreamrExample;
```

The result should look something like this:

![image](@site/static/img/public-stream.png)

## All done 🎉

Congratulations! You accomplished:

- Published data to the Streamr Network using the Streamr client
- Subscribed to flowing data on the Streamr Network using the Streamr client
- Authenticated your users via Metamask
- Learned how to use the React hooks with the Streamr client

If you had any problems along the way, please drop a message to the core team on the #dev channel of our [Discord](https://discord.gg/gZAm8P7hK8).
