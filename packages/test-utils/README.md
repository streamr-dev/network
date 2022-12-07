# @streamr/test-utils
A collection of shared test utilities.

## Table of Contents
- [Install](#install)
- [Use](#use)
- [Best Practices](#best-practices)

## Install
```
npm install --save-dev @streamr/test-utils
```

## Use

This section provides an overview of some functions this package offers. To dive deeper, check the
[code comment](src/utils.ts) of a particular function.

### waitForStreamToEnd
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
