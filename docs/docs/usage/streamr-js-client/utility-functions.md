---
sidebar_position: 3
---

# Utility functions
The Streamr client contains a handful of extra convenience functions to make developing on Streamr a little easier!

## Authentication
The static function `StreamrClient.generateEthereumAccount()` generates a new Ethereum account, returning an object with fields address and privateKey.

```ts
const { address, privateKey } = StreamrClient.generateEthereumAccount()
```

Retrieve the client's address with the async call,

```ts
const address = await streamr.getAddress()
```

## Search for streams
You can search for streams by specifying a search term:

```ts
const streams = await streamr.searchStreams('foo');
```

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
