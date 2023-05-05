---
sidebar_position: 1
---

# Metrics publishing
By default, the **StreamrClient** publishes metrics to the Streamr Network at regular intervals. The metrics include, for example, information about data volumes passing through the node, and are attributed to your node id. Here's the content of the metrics messages:

```ts
{
    node: {
        publishMessagesPerSecond: number
        publishBytesPerSecond: number
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

If you don't want to publish metrics, you can turn it off in the client configuration:

```ts
const streamr = new StreamrClient({
    ...
    metrics: false
})
```

If you want to use custom stream and/or reporting periods, you can specify the details like this:

```ts
const streamr = new StreamrClient({
    ...
    metrics: {
        periods: [{
            duration: 3600000, // in milliseconds
            streamId: "my-metrics-stream.eth/hour"
        }]
    }
})
```
