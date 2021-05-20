# streamr-client-protocol

ES6 JS implementations of [Streamr Protocol](https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md) messages. This is shared code used by (at least):
 
 - [streamr-client-javascript](https://github.com/streamr-dev/streamr-client-javascript)
 - [streamr-broker](https://github.com/streamr-dev/streamr-broker)
 - [streamr-network](https://github.com/streamr-dev/streamr-network)

Please see the [API Docs](https://streamr-dev.github.io/streamr-client-protocol/) for more detailed documentation.

 The package is available on npm as `streamr-client-protocol`.
 
 ## Table of Contents
- [Use](#use)
- [Release](#release)

## Use

#### Creating messages from arguments

Every message type from both the Control Layer and the Message Layer is defined as a class and has a static `create` method that takes class-specific arguments to build an instance of the latest version of the message type. The arguments for each message type are defined in the [protocol documentation](https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md) and in the definition of the `create` method.

This example shows how to create a `StreamMessage` and encapsulate it in a `PublishRequest`.

```javascript
const streamMessage = new StreamMessage({
    messageId: new MessageID(...),
    content
})
const publishRequest = new PublishRequest({
    requestId: 'requestId', 
    streamMessage, 
})
```

#### Serializing messages to strings

Every message type from both the Control Layer and the Message Layer has a `serialize` method, which takes as argument the version to serialize to. By default, it serializes to the latest version of the message type. The `serialize` methods return a string.

```javascript
const streamMessage = new StreamMessage({...})
streamMessage.serialize() // to latest version
// > '[31,["streamId",0,1529549961116,"publisherId","msgChainId"],null,27,0,{"foo":"bar"},0,null]'
streamMessage.serialize(30) // to MessageLayer version 30
// > '[30,["streamId",0,1529549961116,"publisherId","msgChainId"],null,27,{"foo":"bar"},0,null]'

const subscribeRequest = new SubscribeRequest({
    streamId: 'streamId', 
    streamPartition: 0, 
    sessionToken: 'sessionToken',
})
subscribeRequest.serialize() // to latest version
// > '[2,9,"requestId","streamId",0,"sessionToken"]'
subscribeRequest.serialize(1) // to ControlLayer version 1
// > '[1,9,"streamId",0,"sessionToken"]'
```

#### Parsing messages from strings

For deserialization, use the static `deserialize` method that is present in `ControlMessage` for the ControlLayer and `StreamMessage` for the Message Layer. The `deserialize` method accepts both strings and arrays as input.

```javascript
const serializedStreamMessage = '[30,["streamId",0,1529549961116,"publisherId","msgChainId"],null,27,{"foo":"bar"},0,null]'
const streamMessage = StreamMessage.deserialize(serializedStreamMessage)
``` 

On the other hand, the Control Layer has many different message types. So we can only know that the `deserialize` method will return a `ControlMessage`. We can use the `type` field to differentiate.

```javascript
const serializedMessage = '[1,9,"streamId",0,"sessionToken"]'
const controlMessage = ControlMessage.deserialize(serializedMessage)
if (controlMessage.type === ControlMessage.TYPES.UnicastMessage) {
    //treat it as a UnicastMessage
} else if (controlMessage.type === ControlMessage.TYPES.SubscribeRequest) {
    //treat it as a SubscribeRequest
} else if (...) {
    
} else {
    throw new Error(`Unknown type: ${controlMessage.type}`)
}
```

## Release

Publishing to NPM is automated via Github Actions. Follow the steps below to publish stable (`latest`) or `beta`.

### Publishing stable (latest)
1. `git checkout master && git pull`
2. Update version with either `npm version [patch|minor|major]`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created. 
3. `git push --follow-tags`
4. Wait for Github Actions to run tests
5. If tests passed, Github Actions will publish the new version to NPM

### Publishing beta
1. Update version with either `npm version [prepatch|preminor|premajor] --preid=beta`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created. 
2. `git push --follow-tags`
3. Wait for Github Actions to run tests
4. If tests passed, Github Actions will publish the new version to NPM
