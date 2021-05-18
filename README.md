# streamr network/client monorepo

Streamr network, client & supporting packages. Work in progress.

## Contains

* network
* broker
* client
* protocol
* test-utils
* cli-tools
* cross-client-testing

## Build Status

[![Client – Lint, Unit, Integration Tests](https://github.com/streamr-dev/monorepo/actions/workflows/client-code.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/client-code.yml)

[![Client – Test Build](https://github.com/streamr-dev/monorepo/actions/workflows/client-build.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/client-build.yml)

[![Protocol – Lint, Test and Publish](https://github.com/streamr-dev/monorepo/actions/workflows/protocol.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/protocol.yml)

[![Broker – Lint, Test and Publish](https://github.com/streamr-dev/monorepo/actions/workflows/broker.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/broker.yml)

[![Network – Lint, Test and Publish](https://github.com/streamr-dev/monorepo/actions/workflows/network.yml/badge.svg)](https://github.com/streamr-dev/monorepo/actions/workflows/network.yml)

## Installation

Uses [lerna](https://github.com/lerna/lerna#readmes).

```
npm install
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
