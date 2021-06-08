# Streamr Network + Client Monorepo

Streamr network, client & supporting packages. Work in progress.

## Contains

* [network](packages/network/README.md) (streamr-network)
* [broker](packages/broker/README.md) (streamr-broker)
* [client](packages/client/README.md) (streamr-client)
* [protocol](packages/protocol/README.md) (streamr-client-protocol)
* [test-utils](packages/test-utils/README.md) (streamr-test-utils)
* [cli-tools](packages/cli-tools/README.md) (@streamr/cli-tools)
* [cross-client-testing](packages/cross-client-testing/README.md) (com.streamr.client_testing)

## Build Status

[![Client – Lint, Unit, Integration Tests](https://github.com/streamr-dev/monorepo/actions/workflows/client-code.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/client-code.yml)

[![Client – Test Build](https://github.com/streamr-dev/monorepo/actions/workflows/client-build.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/client-build.yml)

[![Protocol – Lint, Test and Publish](https://github.com/streamr-dev/monorepo/actions/workflows/protocol.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/protocol.yml)

[![Broker – Lint, Test and Publish](https://github.com/streamr-dev/monorepo/actions/workflows/broker.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/broker.yml)

[![Network – Lint, Test and Publish](https://github.com/streamr-dev/monorepo/actions/workflows/network.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/network.yml)

## Installation

Uses [lerna](https://github.com/lerna/lerna#readmes).

```
npm ci
npm run bootstrap
```

## Bootstrap one sub-package

```
npm run bootstrap-pkg streamr-client
npm run bootstrap-pkg streamr-network
```

## Install a dependency into a sub-package

```
npx lerna add mkdirp --scope streamr-client
```

## Updating from Remotes

Temporary feature until monorepo becomes primary repo.

Merge remote changes from all remote repos:

```
make pull # keep rerunning until no errors
```

## List active versions & symlinks

Check which packages are currently being symlinked.

```
npm run versions
```

This lists internal packages & their versions on the left, linked packages are columns.
If the package on the left links to the package in the column, it shows a checkmark & the semver range, otherwise it shows the mismatched semver range and prints a warning at the end.
It prints the version ranges so you can double-check that they're formatted as you expect e.g. `^X.Y.Z` vs `X.Y.Z`

![image](https://user-images.githubusercontent.com/43438/120851127-6b173e00-c546-11eb-8b2e-0fcd33d0da5a.png)
