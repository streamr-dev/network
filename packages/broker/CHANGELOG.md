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

- Fix scheduler algorithm: it produced partial metrics samples on rare occasions

### Security


## [32.1.0] - 2023-01-12

### Added

- Environment variables can be used to override values from configuration files
  - `OVERRIDE_BROKER_PRIVATE_KEY` for overriding private key
  - `OVERRIDE_BROKER_BENEFICIARY_ADDRESS` for overriding beneficiary address (miner plugin must be enabled)


## [32.0.1] - 2022-12-14

### Fixed

- Fixed Docker build for target linux/arm64
- Log output is always prettified (even when `NODE_ENV=production`)


[Unreleased]: https://github.com/streamr-dev/network/compare/broker/v32.1.0...HEAD
[32.1.0]: https://github.com/streamr-dev/network/compare/broker/v32.0.1...broker/v32.1.0
[32.0.1]: https://github.com/streamr-dev/network/compare/broker/v32.0.0...broker/v32.0.1
