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


## [33.2.0] - 2023-04-26

### Added

- Add beneficiary address prompt to config wizard

### Changed

- Info plugin provides more detailed diagnostic info
- Websocket plugin includes more logging

### Deprecated

- Deprecate config option `subscriptionRetryInterval` in `subscriber` plugin

### Removed

### Fixed

- Websocket plugin cleans up subscriptions on client disconnect

### Security


## [33.1.2] - 2023-04-13

### Fixed

- Fix crashing issue in network library when `acceptProxyConnections` is enabled


## [33.1.1] - 2023-03-22

### Added

- Add optional config option `client.network.webrtcPortRange`
- Add optional config option `client.network.webrtcMaxMessageSize` 


## [33.1.0] - 2023-03-09

### Added

- Plugin-specific API authentication


## [33.0.0] - 2023-02-20

### Added

- Ping features in `websocket` plugin:
  - server sends pings and disconnects if client doesn't respond with pong
  - application layer ping support

### Changed

- Changed the syntax of environment variables which are used to override configuration files (see [configuration.md](configuration.md))
- Config file is optional
  - uses environment variables and/or application defaults if no file is given

### Fixed

- Fix scheduler algorithm: it produced partial metrics samples on rare occasions


## [32.1.0] - 2023-01-12

### Added

- Environment variables can be used to override values from configuration files
  - `OVERRIDE_BROKER_PRIVATE_KEY` for overriding private key
  - `OVERRIDE_BROKER_BENEFICIARY_ADDRESS` for overriding beneficiary address (miner plugin must be enabled)


## [32.0.1] - 2022-12-14

### Fixed

- Fixed Docker build for target linux/arm64
- Log output is always prettified (even when `NODE_ENV=production`)


[Unreleased]: https://github.com/streamr-dev/network/compare/broker/v33.2.0...HEAD
[33.2.0]: https://github.com/streamr-dev/network/compare/broker/v33.1.2...broker/v33.2.0
[33.1.2]: https://github.com/streamr-dev/network/compare/broker/v33.1.1...broker/v33.1.2
[33.1.1]: https://github.com/streamr-dev/network/compare/broker/v33.1.0...broker/v33.1.1
[33.1.0]: https://github.com/streamr-dev/network/compare/broker/v33.0.0...broker/v33.1.0
[33.1.0]: https://github.com/streamr-dev/network/compare/broker/v33.0.0...broker/v33.1.0
[33.0.0]: https://github.com/streamr-dev/network/compare/broker/v32.1.0...broker/v33.0.0
[32.1.0]: https://github.com/streamr-dev/network/compare/broker/v32.0.1...broker/v32.1.0
[32.0.1]: https://github.com/streamr-dev/network/compare/broker/v32.0.0...broker/v32.0.1
