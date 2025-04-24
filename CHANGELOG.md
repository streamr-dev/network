# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changes before Tatum release are not documented in this file.

## [Unreleased]

### @streamr/sdk

#### Added

- Add support for quantum secure key exchange using ML-KEM (https://github.com/streamr-dev/network/pull/3060)
- Add new storage node address `STREAMR_STORAGE_NODE_ADDRESS` (https://github.com/streamr-dev/network/pull/3020)

#### Changed

- **BREAKING CHANGE**: Browser exports improved, but polyfills now required
  - The package now correctly exposes a `script` export and maps Node-specific modules via the `browser` field
  - Some Node.js modules are no longer automatically polyfilled. Use tools like [`node-polyfill-webpack-plugin`](https://www.npmjs.com/package/node-polyfill-webpack-plugin) (Webpack) or [`vite-plugin-node-polyfills`](https://www.npmjs.com/package/vite-plugin-node-polyfills) (Vite)
  - Refer to [the docs](https://docs.streamr.network/usage/sdk/how-to-use) for migration details
- Renamed `groupKeyId` field `encryptionKeyId` in `Message` interface (https://github.com/streamr-dev/network/pull/3084)

#### Deprecated

- Deprecate storage node address `STREAMR_STORAGE_NODE_GERMANY` (https://github.com/streamr-dev/network/pull/3020)

#### Removed

- **BREAKING CHANGE**: Remove lit protocol integration and related config options `encryption.litProtocolEnabled` and `encryption.litProtocolLogging` (https://github.com/streamr-dev/network/pull/3036)

#### Fixed

- Fix memory leak in `DhtNode` (https://github.com/streamr-dev/network/pull/3065)

#### Security

### @streamr/node

#### Added

#### Changed

#### Deprecated

#### Removed

#### Fixed

#### Security

### @streamr/cli-tools

#### Added

#### Changed

#### Deprecated

#### Removed

#### Fixed

#### Security

## [102.1.0] - 2025-02-19

### @streamr/node

#### Fixed

- Fix false flagging issue (https://github.com/streamr-dev/network/pull/3006)

### @streamr/cli-tools

#### Added

- Add new sub command `streamr storage-node register` to register a storage node (https://github.com/streamr-dev/network/pull/2982)
- Add new sub command `streamr storage-node unregister` to unregister a storage node (https://github.com/streamr-dev/network/pull/2982)
- Add new sub command `streamr storage-node show` to display the metadata of a storage node (https://github.com/streamr-dev/network/pull/2982)


## [102.0.0] - 2025-01-27

### @streamr/sdk

#### Added

- Add support for arbitrary length user IDs: (https://github.com/streamr-dev/network/pull/2774, https://github.com/streamr-dev/network/pull/2780)
  - it is supported for `PUBLISH` and `SUBSCRIBE` permissions
  - new `StreamrClient#getUserId()` method
- Method `StreamrClient#getDiagnosticInfo()` provides diagnostic info about network (https://github.com/streamr-dev/network/pull/2740, https://github.com/streamr-dev/network/pull/2741)
- Add accessors for stream metadata fields: (https://github.com/streamr-dev/network/pull/2825, https://github.com/streamr-dev/network/pull/2845, https://github.com/streamr-dev/network/pull/2883)
  - `Stream#getPartitionCount()`
  - `Stream#getDescription()` and `Stream#setDescription()`
  - `Stream#getStorageDayCount()` and `Stream#setStorageDayCount()`
- Add method `StreamrClient#getStreamMetadata()` (https://github.com/streamr-dev/network/pull/2883)
- Add validation for public permissions (https://github.com/streamr-dev/network/pull/2819)
- Add `opts` parameter to `StreamrClient#addStreamToStorageNode` (https://github.com/streamr-dev/network/pull/2858)
  - controls how long to wait for storage node to pick up on assignment

#### Changed

- **BREAKING CHANGE:** Rename `user` to `userId` in these interfaces: (https://github.com/streamr-dev/network/pull/2811)
  - `UserPermissionAssignment`
    - used in `grantPermissions()`, `revokePermissions()`, `getPermissions()` and `setPermissions()`
  - `UserPermissionQuery`
    - used in `hasPermission()`
  - `SearchStreamsPermissionFilter`
    - used in `searchStreams()`
- **BREAKING CHANGE:** Type `StreamMetadata` is `Record<string, unknown>` (https://github.com/streamr-dev/network/pull/2825, https://github.com/streamr-dev/network/pull/2845)
  - some new accessors available, see above
  - no default values are injected (https://github.com/streamr-dev/network/pull/2851)
- **BREAKING CHANGE:** Method `Stream#addToStorageNode()` doesn't wait for acknowledgment by default (https://github.com/streamr-dev/network/pull/2810)
- **BREAKING CHANGE:** Replace methods `StreamrClient#updateStream()` and `Stream#update()`: (https://github.com/streamr-dev/network/pull/2826, https://github.com/streamr-dev/network/pull/2855, https://github.com/streamr-dev/network/pull/2859, https://github.com/streamr-dev/network/pull/2862)
  - use `StreamrClient#setStreamMetadata()` and `Stream#setMetadata()` instead
  - both methods overwrite metadata instead of merging it
- **BREAKING CHANGE:** Methods `Stream#getMetadata()` and `Stream#getStreamParts()` are async (https://github.com/streamr-dev/network/pull/2883)
- **BREAKING CHANGE:** Rename event `streamRemovedFromFromStorageNode` to `streamRemovedFromStorageNode` (https://github.com/streamr-dev/network/pull/2930)
- **BREAKING CHANGE:** Replace custom errors with `StreamrClientError`: (https://github.com/streamr-dev/network/pull/2895, https://github.com/streamr-dev/network/pull/2927)
  - `StreamrClientError` contains `MessageID` instead of `StreamMessage`
- Caching changes:
  - storage node addresses (https://github.com/streamr-dev/network/pull/2877, https://github.com/streamr-dev/network/pull/2878)
  - stream metadata and permissions (https://github.com/streamr-dev/network/pull/2889)
- Upgrade `StreamRegistry` from v4 to v5 (https://github.com/streamr-dev/network/pull/2780)
- Network-level changes:
  - avoid routing through proxy connections (https://github.com/streamr-dev/network/pull/2801) 
  - internal record `StreamPartitionInfo` format changed (https://github.com/streamr-dev/network/pull/2738, https://github.com/streamr-dev/network/pull/2790)

#### Removed

- **BREAKING CHANGE:** Remove `Stream#detectFields()` method (https://github.com/streamr-dev/network/pull/2864)
- **BREAKING CHANGE:** Remove `Stream#delete()` method (https://github.com/streamr-dev/network/pull/2863)
  - use `StreamrClient#deleteStream()` instead
- **BREAKING CHANGE:** Remove `StreamrClient#findOperators()` method (https://github.com/streamr-dev/network/pull/2876)
- Remove support for legacy encryption keys (https://github.com/streamr-dev/network/pull/2757)
- Remove obsolete config options:
  - `network.node.id` (https://github.com/streamr-dev/network/pull/2777)
  - `network.controlLayer.webNewrtcConnectionTimeout` (https://github.com/streamr-dev/network/pull/2776)

#### Fixed

- Fix WebRTC connections in Firefox (https://github.com/streamr-dev/network/pull/2746)
- Fix flag expiration time in `Operator#getExpiredFlags()` (https://github.com/streamr-dev/network/pull/2739)
- Network-level fixes:
  - fix node discover in small topologies (e.g. ~2 nodes) (https://github.com/streamr-dev/network/pull/2786)
  - fix to time-to-data spike scenarios (https://github.com/streamr-dev/network/pull/2802)
  - make network node stop faster (https://github.com/streamr-dev/network/pull/2736)
  - reject requests after disconnection events (https://github.com/streamr-dev/network/pull/2760)
  - fix geoip database file validation (https://github.com/streamr-dev/network/pull/2783)  

### @streamr/node

#### Added

- Add new operator plugin config options (for testing purposes) (https://github.com/streamr-dev/network/pull/2742)

#### Changed

- The `environment` config option now applies additional settings if `dev2` value is used (https://github.com/streamr-dev/network/pull/2813)
  - e.g. disables `entryPointDiscovery` and `metrics`

#### Removed

- **BREAKING CHANGE:** Remove deprecated `bin/config-wizard` script (i.e. the `streamr-broker-init` command) (https://github.com/streamr-dev/network/pull/2830)
  - use `streamr-node-init` command instead
- **BREAKING CHANGE:** Remove deprecated command `streamr-broker` (https://github.com/streamr-dev/network/pull/2881)
  - use `streamr-node` command instead

#### Fixed

- Fix operator flag voting behavior when using custom gas estimation (https://github.com/streamr-dev/network/pull/2784)
- Fix a bug causing the inspection process to freeze (https://github.com/streamr-dev/network/pull/2893)
- Fix analysis of WebRTC private address probing warning (https://github.com/streamr-dev/network/pull/3070)

### @streamr/cli-tools

#### Added

- Add binary data support to `streamr stream publish` (https://github.com/streamr-dev/network/pull/2947)
- Add binary data support to `streamr stream susbcribe` (https://github.com/streamr-dev/network/pull/2948)
- Add binary data support to `streamr mock-data generate` command (https://github.com/streamr-dev/network/pull/2946)

#### Changed

- **BREAKING CHANGE:** Replace `--dev` flag with `--env` flag (https://github.com/streamr-dev/network/pull/2817, https://github.com/streamr-dev/network/pull/2834)
  - the `--env` flag supports multiple environments
  - if there is a value for `environment` in a config file, this overrides it
  - use `--env dev2` for the development environment


## [101.1.2] - 2024-09-04

### @streamr/sdk

#### Fixed

- Fixed gas estimation in `Operator#voteOnFlag` (https://github.com/streamr-dev/network/pull/2734)


## [101.1.1] - 2024-08-29

### @streamr/sdk

#### Changed

- Numerous improvements to time-to-data (https://github.com/streamr-dev/network/pull/2723, https://github.com/streamr-dev/network/pull/2724, https://github.com/streamr-dev/network/pull/2726, https://github.com/streamr-dev/network/pull/2727)
- Reduce message propagation cache TTL from 30 seconds to 10 seconds (https://github.com/streamr-dev/network/pull/2732)

### @streamr/node

### Changed

- Optimize the "operator value breach" task to be less demanding on EVM RPCs (https://github.com/streamr-dev/network/pull/2721)

#### Fixed

- Add better checks to the "expired flag closing" task so that the likelihood of submitting reverting transactions to the blockchain is reduced (https://github.com/streamr-dev/network/pull/2725)


## [101.1.0] - 2024-08-13

### @streamr/sdk

#### Added

- Add method `findOperators` to client (https://github.com/streamr-dev/network/pull/2703)

#### Fixed

- Fix operator review request event parsing (https://github.com/streamr-dev/network/pull/2714)

### @streamr/node

#### Added

- Operators now register external RPC endpoints for accelerated stream entrypoint discovery (https://github.com/streamr-dev/network/pull/2702)

#### Fixed

- Fix propagation buffer TTL issue (https://github.com/streamr-dev/network/pull/2682)
- Fix operator review request event parsing (https://github.com/streamr-dev/network/pull/2714)


## [101.0.1] - 2024-07-09

### @streamr/sdk

#### Changed

- Set default RPC timeout to 30 seconds (https://github.com/streamr-dev/network/commit/131fb456d26486c12b2facd6e78bee47319c2533)


## [101.0.0] - 2024-07-08

### @streamr/sdk

#### Changed

- Update ethers.js library to v6 (https://github.com/streamr-dev/network/pull/2506)
- Restructure `contracts` config section (https://github.com/streamr-dev/network/pull/2581)
- Improve reliability of JSON RPC interactions by adding retry redundancy (https://github.com/streamr-dev/network/pull/2562, https://github.com/streamr-dev/network/pull/2601)
- Rename events (https://github.com/streamr-dev/network/pull/2604, https://github.com/streamr-dev/network/pull/2605) as denoted below
  - `createStream` => `streamCreated`
  - `addToStorageNode` => `streamAddedToStorageNode`
  - `removeFromStorageNode` => `streamRemovedFromFromStorageNode`
  - `resendComplete` => `resendCompleted` (on instances of `Subscription`)

#### Removed

- Remove obsolete RPC provider options (https://github.com/streamr-dev/network/pull/2583)

### @streamr/node

#### Changed

- Improve reliability of JSON RPC interactions by adding retry redundancy (https://github.com/streamr-dev/network/pull/2562, https://github.com/streamr-dev/network/pull/2601)

#### Deprecated

- Deprecate command `streamr-broker`. Use `streamr-node` instead. (https://github.com/streamr-dev/network/pull/2626)
- Deprecate command `streamr-broker-init`. Use `streamr-node-init` instead. (https://github.com/streamr-dev/network/pull/2626)

#### Fixed

- Fix memory leak in SubscriberPlugin (https://github.com/streamr-dev/network/pull/2578)


## [100.2.4] - 2024-05-06

### @streamr/sdk

#### Added

- New geolocation detection by Nodes improves start up times and the decentralization of the network (https://github.com/streamr-dev/network/pull/2465)
- Improved rejoining streams after losing internet connection (https://github.com/streamr-dev/network/pull/2502)
- Discovering stream neighbors is more efficient as offline nodes are cleaned-up by sending pings (https://github.com/streamr-dev/network/pull/2501)

#### Fixed

- Hanging connection issue with WebSocket clients (https://github.com/streamr-dev/network/pull/2519)

### @streamr/node

#### Added

- Nodes provide geolocation detection for newly joining nodes (https://github.com/streamr-dev/network/pull/2465)

### @streamr/cli-tools

#### Removed

- Removed `governance vote' command (https://github.com/streamr-dev/network/pull/2538)


## [100.2.3] - 2024-04-15

### @streamr/sdk

#### Fixed

- Tweaked and improved JSON RPC handling (https://github.com/streamr-dev/network/pull/2497, https://github.com/streamr-dev/network/pull/2496, https://github.com/streamr-dev/network/pull/2495, https://github.com/streamr-dev/network/pull/2483)


## [100.2.2] - 2024-04-03

### @streamr/sdk

#### Changed

- Update internal list of JSON RPC urls for Polygon


## [100.2.1] - 2024-04-02

### @streamr/sdk

#### Added

- Add node ID to metrics messages (https://github.com/streamr-dev/network/pull/2464)

#### Changed

- Change the way in which the partition of the metrics stream is calculated (based on node ID) (https://github.com/streamr-dev/network/pull/2468)

#### Fixed

- Fix NodeJS v18 compatibility (https://github.com/streamr-dev/network/pull/2462)

### @streamr/node

#### Changed

- Update Docker runtime to NodeJS v20 (https://github.com/streamr-dev/network/pull/2466)


## [100.2.0] - 2024-03-28

### @streamr/sdk

#### Added

- Add support for subscribing to a stream on behalf of an [ERC-1271 contract](https://eips.ethereum.org/EIPS/eip-1271) (https://github.com/streamr-dev/network/pull/2454)


## [100.1.2] - 2024-03-27

### @streamr/sdk

#### Fixed

- Update internal list of JSON RPC urls for Mumbai testnet


## [100.1.1] - 2024-03-26

### @streamr/sdk

#### Fixed
- Update internal list of JSON RPC urls for Polygon


## [100.1.0] - 2024-03-25

### @streamr/sdk

#### Added

- Add support for publishing messages on behalf of an [ERC-1271 contract](https://eips.ethereum.org/EIPS/eip-1271) (https://github.com/streamr-dev/network/pull/2423)
- Add fields `signatureType` and `groupKeyId` to `Message` interface (https://github.com/streamr-dev/network/pull/2423)
- Add ability to disable websocket server (https://github.com/streamr-dev/network/pull/2425)

#### Changed
- Change websocket client library implementation used in Node.js (https://github.com/streamr-dev/network/pull/2384)


[Unreleased]: https://github.com/streamr-dev/network/compare/v102.1.0...HEAD
[102.1.0]: https://github.com/streamr-dev/network/compare/v102.0.0...v102.1.0
[102.0.0]: https://github.com/streamr-dev/network/compare/v101.1.2...v102.0.0
[101.1.2]: https://github.com/streamr-dev/network/compare/v101.1.1...v101.1.2
[101.1.1]: https://github.com/streamr-dev/network/compare/v101.1.0...v101.1.1
[101.1.0]: https://github.com/streamr-dev/network/compare/v101.0.1...v101.1.0
[101.0.1]: https://github.com/streamr-dev/network/compare/v101.0.0...v101.0.1
[101.0.0]: https://github.com/streamr-dev/network/compare/v100.2.4...v101.0.0
[100.2.4]: https://github.com/streamr-dev/network/compare/v100.2.3...v100.2.4
[100.2.3]: https://github.com/streamr-dev/network/compare/v100.2.2...v100.2.3
[100.2.2]: https://github.com/streamr-dev/network/compare/v100.2.1...v100.2.2
[100.2.1]: https://github.com/streamr-dev/network/compare/v100.2.1...v100.2.1
[100.2.0]: https://github.com/streamr-dev/network/compare/v100.1.2...v100.2.0
[100.1.2]: https://github.com/streamr-dev/network/compare/v100.1.1...v100.1.2
[100.1.1]: https://github.com/streamr-dev/network/compare/v100.1.0...v100.1.1
[100.1.0]: https://github.com/streamr-dev/network/compare/v100.0.0...v100.1.0
