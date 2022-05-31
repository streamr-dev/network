# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

As this is still empty, see [cli-tool CHANGELOG](../cli-tools/CHANGELOG.md) for example.
Remove this paragraph when content has been added.

## [Unreleased]

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

[Unreleased]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.8...HEAD
[6.0.8]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.7...client/v6.0.8
[6.0.7]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.6...client/v6.0.7
[6.0.6]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.5...client/v6.0.6
[6.0.5]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.4...client/v6.0.5
[6.0.4]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.3...client/v6.0.4
[6.0.3]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.2...client/v6.0.3
[6.0.2]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.1...client/v6.0.2
[6.0.1]: https://github.com/streamr-dev/network-monorepo/compare/client/v6.0.0...client/v6.0.1
