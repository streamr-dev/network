# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changes before Tatum release are not documented in this file.

## [Unreleased]

### @streamr/sdk

#### Added

- Metrics stream messages contain the node ID

#### Changed

- The partition of the metrics streams is calculated from the node ID

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


## [100.2.0] - 2024-03-28

### @streamr/node

#### Added

- Add support for subscribing to a stream on behalf of an [ERC-1271 contract](https://eips.ethereum.org/EIPS/eip-1271) (https://github.com/streamr-dev/network/pull/2454)


## [100.1.2] - 2024-03-27

### @streamr/node

#### Fixed

- Update internal list of JSON RPC urls for Mumbai testnet


## [100.1.1] - 2024-03-26

### @streamr/node

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


[Unreleased]: https://github.com/streamr-dev/network/compare/v100.2.0...HEAD
[100.2.0]: https://github.com/streamr-dev/network/compare/v100.1.2...v100.2.0
[100.1.2]: https://github.com/streamr-dev/network/compare/v100.1.1...v100.1.2
[100.1.1]: https://github.com/streamr-dev/network/compare/v100.1.0...v100.1.1
[100.1.0]: https://github.com/streamr-dev/network/compare/v100.0.0...v100.1.0
