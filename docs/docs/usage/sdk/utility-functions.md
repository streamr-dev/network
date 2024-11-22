---
sidebar_position: 2
---

# Utility functions
The Streamr SDK contains a handful of extra convenience functions to make developing on Streamr a little easier!

## Authentication
The static function `StreamrClient.generateEthereumAccount()` generates a new Ethereum account, returning an object with fields address and privateKey.

```ts
const { address, privateKey } = StreamrClient.generateEthereumAccount()
```

Retrieve the address with the async call,

```ts
const address = await streamr.getAddress()
```

## Search for streams
You can search for streams by specifying a search term:

```ts
const streams = await streamr.searchStreams('foo');
```

:::caution Important:
Stream searches return an iterable AsyncIterable object that you must iterate over. For example, 

```ts
const streams = await searchStreams...

    for await (stream of streams) {
        console.log(stream)
    }
```
:::

Alternatively or additionally to the search term, you can search for streams based on permissions.

To get all streams for which a user has any direct permission:

```ts
const streams = await streamr.searchStreams('foo', {
  user: '0x12345...',
});
```

To get all streams for which a user has any permission (direct or public):

```ts
const streams = await streamr.searchStreams('foo', {
  user: '0x12345...',
  allowPublic: true,
});
```

It is also possible to filter by specific permissions by using `allOf` and `anyOf` properties. The `allOf` property should be preferred over `anyOf` when possible due to better query performance.

If you want to find the streams you can subscribe to:

```ts
const streams = await streamr.searchStreams(undefined, {
  user: '0x12345...',
  allOf: [StreamPermission.SUBSCRIBE],
  allowPublic: true,
});
```


## Metrics
By default, the Streamr SDK is configured to publish metrics to the Streamr Network at regular intervals. The metrics include, for example, information about data volumes passing through the node, and are attributed to your node id. Here's the content of the metrics messages:

```ts
{
    node: {
        id: string
        broadcastMessagesPerSecond: number
        broadcastBytesPerSecond: number
        sendMessagesPerSecond: number
        sendBytesPerSecond: number
        receiveMessagesPerSecond: number
        receiveBytesPerSecond: number
        connectionAverageCount: number
        connectionTotalFailureCount: number
    },
    period: {
        start: number
        end: number
    }
}
```

If you don't want to publish metrics, you can turn it off in the constructor configuration:

```ts
const Streamr = require('@streamr/sdk')

const streamr = new Streamr({
    ...
    metrics: false
})
```

If you want to use custom stream and/or reporting periods, you can specify the details like this:

```ts
const Streamr = require('@streamr/sdk')
const streamr = new Streamr({
    ...
    metrics: {
        periods: [{
            duration: 3600000, // in milliseconds
            streamId: "my-metrics-stream.eth/hour"
        }]
    }
})
```
