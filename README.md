[![Build Status](https://travis-ci.com/streamr-dev/streamr-client-protocol-js.svg?branch=master)](https://travis-ci.com/streamr-dev/streamr-client-protocol-js)

This repository contains ES6 JS implementations of the Streamr [protocol](https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md) messages. This is shared code used by:
 
 - [streamr-client-javascript](https://github.com/streamr-dev/streamr-client-javascript)
 - [broker](https://github.com/streamr-dev/broker)
 - [network](https://github.com/streamr-dev/network)
 
 This package is available on npm as `streamr-client-protocol`.

### Usage

This section describes how to use the Javascript implementation of the [protocol](https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md).

#### Creating messages from arguments

Every message type from both the Control Layer and the Message Layer is defined as a class and has a static `create` method that takes class-specific arguments to build an instance of the latest version of the message type. The arguments for each message type are defined in the [protocol documentation](https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md) and in the definition of the `create` method.

This example shows how to build a `StreamMessage` and encapsulate it in a  `UnicastMessage`.

```javascript
const content = {
    foo: 'bar',
}
// arguments in order: stream id, stream partition, timestamp, sequence number, publisher id, message chain id,
// previous message reference, content type, content, signature type, signature
const streamMessage = StreamMessage.create(['streamId', 0, Date.now(), 0, 'publisherId', 'msgChainId'],
                                             null, StreamMessage.CONTENT_TYPES.JSON, content,
                                             StreamMessage.SIGNATURE_TYPES.NONE, null)
const unicastMessage = UnicastMessage.create("subscriptionId", streamMessage)
```

#### Serializing messages to JSON arrays or strings

Every message type from both the Control Layer and the Message Layer has a `serialize` method that takes different optional arguments depending on the message type. For every message type, the first argument is the version of the resulting serialized message. By default, it serializes to the latest version of the message type and the result is a string.

```javascript
const streamMessage = StreamMessage.create(...)
streamMessage.serialize()
// > '[30,["streamId",0,1529549961116,"publisherId","msgChainId"],null,27,{"foo":"bar"},0,null]'
streamMessage.serialize(29, {
    stringify: false
})
// > [29, 'streamId', 0, 1529549961116, 0, 1529549961116, null, 27, {valid: "json"}, 0, null, null]

const subscribeRequest = SubscribeRequest.create('streamId', 0, 'sessionToken')
subscribeRequest.serialize()
// > '[1,9,"streamId",0,"sessionToken"]'
```

#### Parsing messages from JSON arrays or strings

For deserialization, use the static `deserialize` method that is present in `ControlMessage` for the ControlLayer and `StreamMessageFactory` for the Message Layer. The `deserialize` method accepts both strings and arrays as input.

The Message Layer only has one type of message (`StreamMessage`), so we know that the `deserialize` function will return a `StreamMessage` and all the functions and fields of this class can be used. Some functions might be defined only for some specific versions like `StreamMessageV30`, in that case use the `version` field to differentiate.

```javascript
const serializedMessage = '[30,["streamId",0,1529549961116,"publisherId","msgChainId"],null,27,{"foo":"bar"},0,null]'
const streamMessage = StreamMessageFactory.deserialize(serializedMessage)
// use functions/fields present in all versions
if (streamMessage.version === 30) {
    // treat it as a StreamMessageV30
} else if (streamMessage.version === 29) {
    // treat it as a StreamMessageV29
}
``` 

On the other hand, the Control Layer has many different message types. So we can only know that the `deserialize` method will return a `ControlMessage`. We can use the `type` field to differentiate.

```javascript
const serializedMessage = '[1,9,"streamId",0,"sessionToken"]'
const controlMessage = ControlMessage.deserialize(serializedMessage)
if (controlMessage.type === UnicastMessage.TYPE) {
    //treat it as a UnicastMessage
} else if (controlMessage.type === SubscribeRequest.TYPE) {
    //treat it as a SubscribeRequest
} else if (...) {
    
} else {
    throw new Error(`Unknown type: ${controlMessage.type}`)
}
```

## Publishing

Publishing to NPM is automated via Github Actions. Follow the steps below to publish `latest` or `beta`.

### Publishing `latest`:
1. Update version with either `npm version [patch|minor|major]`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created. 
2. `git push --follow-tags`
3. Wait for Github Actions to run tests
4. If tests passed, Github Actions will publish the new version to NPM

### Publishing `beta`:
1. Update version with either `npm version [prepatch|preminor|premajor] --preid=beta`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created. 
2. `git push --follow-tags`
3. Wait for Github Actions to run tests
4. If tests passed, Github Actions will publish the new version to NPM
