---
sidebar_position: 2
---

# Debugging streams
<!-- TODO, talking through common connectivity issues and so on -->
Turning up the log level is a good way to diagnose tricky connectivity problems. There are two ways to set a desired logging level.

You can pass the logging level in the StreamrClient constructor as follows:

```ts
const streamr = new StreamrClient({
  logLevel: 'debug',
  // ... more options
})
```

Alternatively, when running your application in Node.js, you can provide the logging level via the environment variable LOG_LEVEL, for example, by running your application as follows:

```ts
LOG_LEVEL=trace node your-app.js
```

When defining both the environment variable takes precedence. Default logging level is info. Valid logging levels are silent, fatal, error, warn, info, debug, and trace.