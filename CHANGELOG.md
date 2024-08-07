# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changes before Tatum release are not documented in this file.

## [Unreleased]

### @streamr/sdk

#### Added

#### Changed

#### Deprecated

#### Removed

#### Fixed

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


## [101.0.1] - 2047-07-09

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


[Unreleased]: https://github.com/streamr-dev/network/compare/v101.0.1...HEAD
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
