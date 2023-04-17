# Logging Practices

### No secrets in log messages
Consequence: we should never print (decrypted) payloads as they could contain sensitive information.

### Grammar of log messages
Log message should:
- start with a capitalized verb
- the subject should be the class / module / function that was passed to the `Logger` constructor
- should not end with a period

Regarding verb tense:
- Use basic imperative form when we don't make distinction between whether the operation has been done or will be
  done, e.g. `Subscribe` (preferred)
- Use `-ed` form when the operation has been done, e.g., `Subscribed`.
- Use `-ing` form only together with later `-ed` form. E.g. `Subscribing to stream`, and later `Subscribed to stream`.

Examples:
- `Join stream`
- `Publish message`
- `Analyzing NAT type`, ..., `Analyzed NAT type`
- `Encountered error while processing message`

*The exception* to this rule is `trace` level logs. Here we can be more cryptic and use e.g. method / function names as
log  messages for simplicity. The point being that these don't have to be necessarily interpretable on their own.

### Use log levels appropriately
- `FATAL` printed before an imminent software crash
- `ERROR` something unusual went wrong, probably requiring user intervention, but the software as a whole continues running
- `WARN` something typical went wrong, does not warrant user intervention necessarily
- `INFO` something worth noting, e.g. in storage node a new state update, receiving a reward in Brubeck miner plugin
- `DEBUG` more details about the operation of a module, however should not be overwhelming in quantity
- `TRACE` equivalent to leftover debug messages, low level, kept on modules that exhibit higher defect rates, hopefully removed down the line

### Providing values
Prefer adding values as metadata instead of including them in the message itself.

Instead of

```ts
logger.info(`Executed resend of stream partition ${streamPartition} with resend options ${JSON.stringify(resendOptions)}`)
```
Prefer
```ts
logger.info('Executed resend', {
    streamPartition,
    resendOptions
})
```

*The exception* to this rule is when the message only exists to convey the value(s) in question and the audience is the
end-users. This should be done _very sparingly_ E.g.
```ts
logger.info('Connected to %d peers', connectionCount)
```

### Use `traceId` for tracking long-running operations
Use `traceId` for tracking long-running operations that may get interleaved by other operations.
E.g.

```ts
import { randomString } from '@streamr/utils'

function poll(): Promise<Result> {
    const traceId = randomString(5)
    logger.debug('Polling for result', { traceId })
    // ...
    while (!resultAvailable) {
        // ...
        logger.debug('Retry poll', { traceId })
        // ..
    }
    // ...
    logger.debug('Polled result', { traceId, result })
    return result
}
```
