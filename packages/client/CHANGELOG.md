# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security


## [7.1.0] - 2022-11-25

- Deprecate TypeScript interfaces `StrictStreamrClientConfig`
- Deprecate `gasPriceStrategy` config option in `contracts.ethereumNetworks`, use `highGasPriceStrategy` instead
- Deprecate method parameter of `.waitForStorage()`

### Fixed
- Networking issue in which connections could not be formed via WebRTC if STUN or TURN were needed


## [7.0.3] - 2022-11-23

### Changed

- Change default list of Ethereum RPC URLs


## [7.0.2] - 2022-11-22

### Deprecated

- Deprecate `STREAM_CLIENT_DEFAULTS` constant
- Deprecate `ConfigTest` constant, use `CONFIG_TEST` instead

### Removed

- Remove (non-functional) client configuration option `contracts.ensCacheChainAddress`

### Fixed

- Fix CORS issue in browser when interacting with smart contracts
  - Remove https://rpc-mainnet.matic.network/ from default list of Polygon RPCs


## [7.0.1] - 2022-11-18

### Changed

- Simplify authentication config type to use union instead of `XOR`

### Removed

- Remove TypeScript interfaces and types:
  - `AuthConfig`
  - `NetworkConfig`
  - `EthereumConfig`
  - `SubscriberConfig`
  - `DecryptionConfig`
  - `CacheConfig`
  - `MetricsConfig`
  - `MetricsPeriodConfig`
  - `TimeoutsConfig`
  - `XOR`
  - `Without`


## [7.0.0] - 2022-11-15

### Added

- The client publishes telemetry metrics to the network at regular intervals (enabled by default, configurable with `metrics` config option)
- You can manually update a stream encryption key with method `.updateEncryptionKey()`
- Add optional client configuration option `logLevel` to set desired logging level.

### Changed

- Methods related to publishing and subscribing operate on new interfaces `Message` and `MessageMetadata` instead of `StreamMessage`
  - in `.subscribe()` and `.resend()` the data type of 2nd parameter of `onMessage` callback is `MessageMetadata` instead of `StreamMessage`
  - in `.subscribe()`, `.resend()` and `.resendSubscribe()` the async iterator type is `Message` instead of `StreamMessage`
  - in `.publish()` and `stream.publish()` the return type is `Message` instead of `StreamMessage`
  - in `.waitForStorage()` parameter type is `Message` instead of `StreamMessage`
- Change method signatures of `.publish()` and `stream.publish()`
  - optional metadata is given as an object instead of positional arguments
  - new metadata field: `msgChainId`
- Config option `auth` must be non-empty (if given)
- Encryption keys are delivered in-stream, not in a separate key exchange stream
  - new optional config options `decryption.keyRequestTimeout` and `decryption.maxKeyRequestsPerSecond`
  - notice that key exchange is not backwards compatible with v6 clients
- Replace method `subscription.onResent(listener)` with `subscription.once('resendComplete', listener)`
- Resend supports multiple storage nodes: the data is fetched from a random storage node
- Enforce concurrency limit for smart contract calls (per contract, configurable with `contracts.maxConcurrentCalls` config option)
- Enforce presence of message signatures
  - all non-signed messages received by client are simply ignored
- Stream metadata now accessed through `stream.getMetadata()`
  - e.g. usages of `stream.partitions` has changed to `stream.getMetadata().partitions`
- Method `stream.update()` parameter `props` is no longer optional
- Rename method `.getStorageNodesOf()` to `.getStorageNodes()`
- Rename method `.getStoredStreamsOf()` to `.getStoredStreams()`
- Rename method `.isStreamStoredInStorageNode()` to `.isStoredStream()`
- Replaced methods `.createOrUpdateNodeInStorageNodeRegistry()` and `.removeNodeFromStorageNodeRegistry()` with single method `.setStorageNodeMetadata()`
- Change configuration option `network.stunUrls` to `network.iceServers` with new format
- Move contract configuration options from root level to new `contracts` block
- Change storage node assignment event handlers
  - replace method `.registerStorageEventListeners(listener)` with `.on('addToStorageNode', listener)` and `.on('removeFromStorageNode', listener)`
  - replace method `.unRegisterStorageEventListeners()` with `.off('addToStorageNode', listener)` and `.off('removeFromStorageNode', listener)`
- Rename interface `SubscriptionOnMessage`/`MessageStreamOnMessage` to `MessageListener`
- Rename class `GroupKey` to `EncryptionKey`
- Rename interface `TrackerRegistrySmartContract` to `TrackerRegistryContract`
- Change interface of `MessageStream` from `AsyncGenerator` to `AsyncIterable`
- Change return type of `.getStreamPublishers()`, `.getStreamSubscribers()` and `.searchStreams()` from `AsyncGenerator` to `AsyncIterable`
- Result set of `.getStoredStreams()` is no longer capped to 1000 streams
- Result sets of `.getPermissions()` and `.getStorageNodes()` are no longer capped to 100 items

### Deprecated

- Deprecate `.getNode()` method and interface `NetworkNodeStub`

### Removed

- Remove Data Union functionality
  - functionality moved to package `@dataunions/client`
- Remove method `.getAllStorageNodes()`
  - use `.getStorageNodes()` without arguments to same effect
- Remove method `.disconnect()`
  - use `.destroy()` instead
- Remove method `.unsubscribeAll()`
  - use `.unsubscribe()` without arguments to same effect
- Remove method `stream.toObject()` and interface `StreamProperties`
  - use `stream.getMetadata()` to get metadata (doesn't contain stream id)
  - use interface `StreamMetadata` instead
- Remove properties `subscription.onMessage`, `onStart`, and `onError`
  - use `subscription.on('error', cb)` to add an error listener
- Remove configuration option `groupKeys`
  - use methods `.updateEncryptionKey()` and `.addEncryptionKey()` instead
- Remove client configuration option `verifySignatures`
- Remove client configuration option `client.network.name`
- Remove client configuration option `client.debug`
- Remove (non-functional) client configuration options `autoConnect`, `autoDisconnect`, and `maxRetries`
- Remove `AuthenticatedAuthConfig` and `UnauthenticatedAuthConfig` interfaces

### Fixed

- Promise `MessageStream` returned from `.resend()` does not reject in the case of an encryption key being unavailable
- Fix timeout issue of method `stream.addToStorageNode()` when used with storage node cluster
- Fix concurrency issue when encryption keys are added in parallel for multiple streams (`SQLITE_ERROR: no such table: GroupKeys`)


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

[Unreleased]: https://github.com/streamr-dev/network/compare/client/v7.1.0...HEAD
[7.1.0]: https://github.com/streamr-dev/network/compare/client/v7.0.3...client/v7.1.0
[7.0.3]: https://github.com/streamr-dev/network/compare/client/v7.0.2...client/v7.0.3
[7.0.2]: https://github.com/streamr-dev/network/compare/client/v7.0.1...client/v7.0.2
[7.0.1]: https://github.com/streamr-dev/network/compare/client/v7.0.0...client/v7.0.1
[7.0.0]: https://github.com/streamr-dev/network/compare/client/v6.0.10...client/v7.0.0
[6.0.10]: https://github.com/streamr-dev/network/compare/client/v6.0.9...client/v6.0.10
[6.0.9]: https://github.com/streamr-dev/network/compare/client/v6.0.8...client/v6.0.9
[6.0.8]: https://github.com/streamr-dev/network/compare/client/v6.0.7...client/v6.0.8
[6.0.7]: https://github.com/streamr-dev/network/compare/client/v6.0.6...client/v6.0.7
[6.0.6]: https://github.com/streamr-dev/network/compare/client/v6.0.5...client/v6.0.6
[6.0.5]: https://github.com/streamr-dev/network/compare/client/v6.0.4...client/v6.0.5
[6.0.4]: https://github.com/streamr-dev/network/compare/client/v6.0.3...client/v6.0.4
[6.0.3]: https://github.com/streamr-dev/network/compare/client/v6.0.2...client/v6.0.3
[6.0.2]: https://github.com/streamr-dev/network/compare/client/v6.0.1...client/v6.0.2
[6.0.1]: https://github.com/streamr-dev/network/compare/client/v6.0.0...client/v6.0.1
