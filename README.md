<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header-img.png" width="1320" />
  </a>
</p>

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

Uses [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces).

```bash
# from top level
npm ci # installs dependencies for all packages and links them together
```

##  Install + link one sub-package

The script `bootstrap-pkg` script installs all dependencies of a
sub-package, links internal packages, builds sub-deps and the target dep
by running their `prepare` scripts. Make sure you've at least run `npm
run bootstrap` first though.

### Important: Do not use `npm ci` or `npm install` in monorepo sub-package directories.

Normal `npm ci` and `npm install` commmands *will not work* within a sub-package e.g. `packages/streamr-client`, because `npm` doesn't know how to deal with the monorepo sub-package linking.

```bash
# from top level
npm run bootstrap-pkg $PACKAGE_NAME

# e.g.
npm run bootstrap-pkg streamr-client
npm run bootstrap-pkg streamr-network
```

## Regenerate lockfiles

```bash
# from top level
rm -f package-lock.json
npm install
```

## Clean Cached/Built Files

This cleans all cache and `dist` directories from each sub-package.

```bash
# from top level
npm run clean-dist
```

## Clean All

This removes all cached/built files and `node_modules` from each
sub-package, and the top-level node_modules.  You will need to run `npm
ci` (honour package-lock), `npm install` (update package-lock) or `npm
run bootstrap` (only install top-level packages) before proceeding.

```bash
# from top level
npm run clean
npm run bootstrap
```

## Install an npm/internal dependency into a sub-package

Manually add the package + version to the appropriate `package.json` and
run `npm run bootstrap-pkg $PACKAGE_NAME`.

or:

```bash
npm install some-dependency --workspace=$PACKAGE_NAME
```

## List active versions & symlinks

Check which packages are currently being symlinked.

```bash
# from top level
npm run versions
```

This lists internal packages & their versions on the left, linked
packages are columns.  If the package on the left links to the package
in the column, it shows a checkmark & the semver range, otherwise it
shows the mismatched semver range and prints a warning at the end.  It
prints the version ranges so you can double-check that they're formatted
as you expect e.g. `^X.Y.Z` vs `X.Y.Z`

![image](https://user-images.githubusercontent.com/43438/135347920-97d6e0e7-b86c-40ff-bfc9-91f160ae975c.png)
