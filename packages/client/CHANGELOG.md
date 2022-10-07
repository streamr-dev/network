# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The client publishes telemetry metrics to the network at regular intervals (enabled by default, configurable with `metrics` config option)
- You can manually update a stream encryption key with method `updateEncryptionKey`

### Changed

- Encryption keys are delivered in-stream, not in a separate key exchange stream
  - new optional config options `decryption.keyRequestTimeout` and `decryption.maxKeyRequestsPerSecond`
  - notice that key exchange is not backwards compatible with v6 clients
- Change method signatures of `client.publish` and `stream.publish`
  - optional metadata is given as an object instead of positional arguments
  - new metadata field: `msgChainId`
- Replace method `subscription.onResent(listener)` with `subscription.once('resendComplete', listener)`
- Resend supports multiple storage nodes: the data is fetched from a random storage node
- Enforce concurrency limit for smart contract calls (per contract, configurable with `maxConcurrentContractCalls` config option)
- Method `stream.update()` parameter `props` is no longer optional
- Rename method `getStorageNodesOf()` to `getStorageNodes()`
- Rename method `getStoredStreamsOf()` to `getStoredStreams()`
- Rename method `isStreamStoredInStorageNode()` to `isStoredStream()`
- Replaced methods `createOrUpdateNodeInStorageNodeRegistry()` and `removeNodeFromStorageNodeRegistry()` with single method `setStorageNodeMetadata()`
- Change storage node assignment event handlers
  - replace method `registerStorageEventListeners(listener)` with `on('addToStorageNode', listener)` and `on('removeFromStorageNode', listener)`
  - replace method `unRegisterStorageEventListeners()` with `off('addToStorageNode', listener)` and `off('removeFromStorageNode', listener)`
- Rename classes `GroupKey` and `GroupKeyId` to `EncryptionKey` and `EncryptionKeyId`

### Deprecated

### Removed

- Remove Data Union functionality
  - functionality moved to package `@dataunions/client`
- Remove method `getAllStorageNodes()`
  - use `getStorageNodes()` without arguments to same effect
- Remove method `disconnect()`
  - use `destroy()` instead
- Remove method `unsubscribeAll()`
  - use `unsubscribe()` without arguments to same effect
- Remove properties `subscription.onMessage`, `onStart`, and `onError`
  - use `subscription.on('error', cb)` to add an error listener
- Remove configuration option `groupKeys`
  - use methods `updateEncryptionKey` and `addEncryptionKey` instead
- Remove client configuration option `verifySignatures`
- Remove client configuration option `client.network.name`
- Remove client configuration option `client.debug`
- Remove (non-functional) client configuration options `autoConnect`, `autoDisconnect`, and `maxRetries`

### Fixed

- Promise `MessageStream` returned from `resend()` does not reject in the case of an encryption key being unavailable
- Fix timeout issue of method `addToStorageNode` when used with storage node cluster
- Fix concurrency issue when encryption keys are added in parallel for multiple streams (`SQLITE_ERROR: no such table: GroupKeys`)

### Security


## [6.0.10] - 2022-10-03

### Fixed

- Fix `searchStreams`, `getStreamSubscribers`, and `getStreamPublishers` timestamp filtering behaviour where valid
  entries were not appearing in the result set.

## [6.0.9] - 2022-06-20

### Fixed

- Update `streamr-network` library to include fix to `std::bad_weak_ptr` crashing issue

## [6.0.8] - 2022-05-31

### Fixed

- Update `streamr-network` library to include propagation fix to proxy stream behaviour

## [6.0.7] - 2022-05-25

### Fixed

- Update `streamr-network` library to include race condition fix to proxy stream behaviour

## [6.0.6] - 2022-05-24

### Fixed

- Subscriptions now have a default error handler in case of errors in message processing (e.g. message validation failures).
  This means that unhandled promise rejections will not occur when not setting an explicit error handler. The default error
  handler will simply log the error and continue.

## [6.0.5] - 2022-05-10

### Fixed

- Update `streamr-network` library to include stability fixes

## [6.0.4] - 2022-04-28

### Fixed
- Update `streamr-network` library that includes a fix to Firefox compatibility

## [6.0.3] - 2022-04-25

### Fixed
- Fix stream encryption: messages weren't automatically encrypted if the local database didn't contain pre-existing encryption keys for a stream

## [6.0.2] - 2022-03-04

### Fixed
- Fixed an issue in which method `searchStreams` would throw on invalid metadata (NET-730)

## [6.0.1] - 2022-02-24

### Fixed
- Fixed an import so that the client successfully loads in a web browser environment (NET-721)

[Unreleased]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.10...HEAD
[6.0.10]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.9...client/v6.0.10
[6.0.9]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.8...client/v6.0.9
[6.0.8]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.7...client/v6.0.8
[6.0.7]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.6...client/v6.0.7
[6.0.6]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.5...client/v6.0.6
[6.0.5]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.4...client/v6.0.5
[6.0.4]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.3...client/v6.0.4
[6.0.3]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.2...client/v6.0.3
[6.0.2]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.1...client/v6.0.2
[6.0.1]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.0...client/v6.0.1
