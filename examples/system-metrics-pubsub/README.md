# System-metric-pubsub example

An example Streamr Network in a pub/sub setting. 

This example network generates one Tracker and one Publisher Node, connnecting to N Subscriber nodes. The Publisher Node publishes system metrics to the `'system-report'` stream every two seconds. Subscriber nodes subscribe to this `'system-report'`  stream and output the arriving messages in stdout. The Tracker assists the nodes in peer discovery (finding and connecting to each other).

Install
```
npm ci
```

In one terminal window run `network-init`, which starts the tracker and publisher node:
```
npm run network-init
```

In a different terminal window run a subscriber node:
```
npm run subscriber
```

You should see your system metrics stream into the subscriber terminal window.

### Debugging

Run with debugging enabled
```
npm run network-init-with-logging
npm run subscriber-with-logging
```
