# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Bump dependency streamr-client to 5.0.0-beta.6
- Bump dependency commander to ^6.1.0

## [4.1.0] - 2020-10-12
### Changed
- Bump dependency streamr-client to ^4.1.1.
- Turn option `--privateKey` into `--private-key` for consistency.
- Turn `--apiKey` into `--api-key` for consistency.

## [4.0.0] - 2020-06-18
### Added
- Ethereum authentication with `--privateKey <key>`. This also enables message signing when publishing messages.

### Changed
-  (Breaking) Rename command `listen` to `subscribe`.
- (Breaking) API key is now given with `--apiKey <key>`. API keys are deprecated. Option `--privateKey` should be preferred.

## [3.1.1] - 2020-04-16
### Added
- Add `--subscribe` flag to commands `streamr resend from` and `streamr resend last`. This causes the command to resend and subscribe. 

### Changed
- Bump dependency streamr-client to ^3.1.3.

## [3.1.0] - 2019-12-12
### Added
- Add `--disable-ordering` flag to command `streamr listen` for disabling
ordering and gap filling.
- Add `--disable-ordering` flag to commands `streamr resend *` to disabling
ordering and gap filling.

## [3.0.1] - 2019-10-14
### Added
- Start keeping a CHANGELOG.md.

### Changed
- Bump dependency streamr-client to ^2.2.7.
- Bump dependency commander to ^4.0.1.
- Re-organize README.md and a few touches to Developing section paragraphs.

[Unreleased]: https://github.com/streamr-dev/cli-tools/compare/v4.1.0...HEAD
[4.1.0]: https://github.com/streamr-dev/cli-tools/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/streamr-dev/cli-tools/compare/v3.1.1...v4.0.0
[3.1.1]: https://github.com/streamr-dev/cli-tools/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/streamr-dev/cli-tools/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/streamr-dev/cli-tools/compare/v3.0.0...v3.0.1
