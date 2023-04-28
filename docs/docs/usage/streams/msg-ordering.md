---
sidebar_position: 7
---

# Message ordering
Streams on the Streamr Network deliver ordered messages.
 
If your use case tolerates missing messages and message arriving out-of-order, you can turn off message ordering and gap filling when creating a instance of the client:

```ts
const streamr = new StreamrClient({
    auth: { ... },
    orderMessages: false,
    gapFill: false
})
```

Both of these properties should be disabled in tandem for message ordering and gap filling to be properly turned off.

By disabling message ordering your application won't perform any filling nor sorting, dispatching messages as they come (faster) but without granting their collective integrity.
