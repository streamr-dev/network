# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2020-06-18
### Added
- Support for authenticating with an Ethereum private key by passing `--privateKey <key>`. This also automatically enables message signing when publishing messages.

### Changed
- Renamed `listen` to `subscribe` to unify terminology
- API key can be given with `--apiKey <key>`. API keys are deprecated, so `--privateKey` should be the preferred authentication method.

## [3.1.0] - 2019-12-12
### Added
- Add `--disable-ordering` flag to command `streamr listen` for disabling
ordering and gap filling.
- Add `--disable-ordering` flag to commands `streamr resend *` to disabling
ordering and gap filling.

## [3.0.1] - 2019-10-14
### Added
- Starting keeping a CHANGELOG.md

### Changed
- Bump dependency streamr-client to ^2.2.7
- Bump dependency commander to ^4.0.1 
- Re-organize README.md and a few touches to Developing section paragraphs

[Unreleased]: https://github.com/streamr-dev/cli-tools/compare/v3.1.0...HEAD
[3.1.0]: https://github.com/streamr-dev/cli-tools/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/streamr-dev/cli-tools/compare/v3.0.0...v3.0.1
