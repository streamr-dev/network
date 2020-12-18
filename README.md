# streamr-test-utils
A collection of Node.js utilities for dealing with asynchronous behavior in jest/mocha tests.

## Table of Contents
- [Install](#install)
- [Use](#use)
- [Best Practices](#best-practices)

## Install
In your Node.js project run
```
npm install --save-dev streamr-test-utils
```
to add this npm package as a development dependency.

## Use

This section provides an overview of the utilities (functions) that this package offers. To dive deeper, check the
[code comment](src/utils.ts) of a particular function.

### Control flow utilities

Used primarily for waiting for something asynchronous to happen.

#### waitForStreamToEnd
```
waitForStreamToEnd(stream) => Promise
```

Collect data of a stream into an array. The array is wrapped in a Promise that resolves when the stream ends.

Example:
```js
test('test', async () => {
    const stream = node.requestResendLast(...)
    const messages = await waitForStreamToEnd(stream)
    expect(messages).toEqual([
        ....
    ])
})
``` 

#### waitForEvent
```
waitForEvent(emitter, event, timeout = 5000) => Promise
```

Wait for an event to be emitted on emitter within timeout.

Example:
```js
test('test', async () => {
    const [message] = await waitForEvent(node, events.MESSAGE_PROPAGATED)
    expect(message).toEqual('something')
})
``` 

#### waitForCondition
```
waitForCondition(conditionFn, timeout = 5000, retryInterval = 100, onTimeoutContext? () => string) => Promise
```

Wait for a condition to become true by re-evaluating it every `retryInterval` milliseconds.

Example:
```js
test('test', async () => {
    ...
    await waitForCondition(() => messages.length >= 4)
    expect(messages).toEqual([
        ...
    ])
})
``` 

#### wait
```
wait(ms) => Promise
```

Wait for a specific time

Example:
```js
test('test', async () => {
    ...
    await wait(2000) // 2 seconds
    expect(messages).toEqual([
        ...
    ])
})
``` 

### Convenience utilities

Helpful functions for dealing with async-related matters.

### eventsToArray
```
eventsToArray(emitter, events) => Array
```

Collect events emitted by an emitter into an array.

Example:
```js
test('test', async () => {
    const arr = eventsToArray(emitter, ['RESENDING', 'UNICAST', 'RESENT', 'NO_RESEND'])
    await emitter.longRunningFnThatEmitsEvents()
    expect(arr).toEqual([
        'RESENDING',
        'UNICAST',
        'UNICAST',
        'UNICAST',
        'RESENT'
    ])
})
``` 

### eventsWithArgsToArray
```
eventsWithArgsToArray(emitter, events) => Array
```

Collect events emitted by an emitter into an array, including event arguments.

Example:
```js
test('test', async () => {
    const arr = eventsToArray(emitter, ['RESENDING', 'UNICAST', 'RESENT', 'NO_RESEND'])
    await emitter.longRunningFnThatEmitsEvents()
    expect(arr).toEqual([
        ['RESENDING', 'subId'],
        ['UNICAST', StreamMessage.create(...)],
        ['UNICAST', StreamMessage.create(...)],
        ['UNICAST', StreamMessage.create(...)],
        ['RESENT', 'subId']
    ])
})
``` 

### toReadableStream
```
toReadableStream(...args)
```

Make a `ReadableStream` out of an array of items. Any item of type `Error` will be emitted as an error event instead
of pushed to stream.

```js
test('test', () => {
    const stream = toReadableStream([
        StreamMessage.create(...),
        StreamMessage.create(...),
        StreamMessage.create(...),
        StreamMessage.create(...)
    ])
    stream.on('data', (data) => {
        console.info(data)
    })
    stream.on('end', () => {
        console.info('DONE')
    })
})
```

### callbackToPromise
```
callbackToPromise(fn, ...args)
```

Convert a function that has as its last parameter a callback of the form `(err, result)` into a Promise.

Example:
```js
const fs = require('fs')

callbackToPromise(fs.readFile, 'README.md')
    .then((res) => {
        ...
    })
``` 

## Best Practices

It would seem like the best order in which to use the control flow utilities is something like
1. Simply await a Promise if possible & relevant
2. `waitForStreamToEnd` if dealing with ReadableStream
3. `waitForEvent` if dealing with events
4. `waitForCondition` when there is no direct handle to the async-behavior 
5. `wait` if nothing else works

### Try to avoid using `wait` when possible.

- It is prone to timing issues which leads to test flaky-ness.
- It increases test run time because we always wait for the pre-determined amount of time even if the required pre-condition has been met.
- We often have to use quite large delays to err on the side of caution, increasing test run time further.

### When using `waitForCondition` favor simple conditions
- The utility doesn't provide detailed info on what went wrong; when a condition fails, you will not have much visibility into the "why". 
- Use a simple condition for `waitForCondition` and then later on in the test function perform proper assertions using the facilities provided by your test framework.
- E.g. use `waitForCondition` to wait for an array to have elements in it. Then afterwards assert the contents of those elements.

### Other
- Usefulness of `waitForEvent` declines in the presence of multiple events from the same emitter with the same event type
    - Consider bringing in `eventsToArray` or `eventsWithArgsToArray` to help
- Notice that `waitForStreamToEnd` has two uses cases: collecting the data of a stream into an array _and_ waiting for a
stream to be closed.
    - In some use cases you may only be interested in waiting for the stream to end. You don't have to examine the
    contents of the stream.
