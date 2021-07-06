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

```bash
# from top level
npm ci # installs monorepo top-level dependencies
npm run bootstrap # installs dependencies for all packages and links them together
```

##  Install + link one sub-package

The script `bootstrap-pkg` script installs all dependencies of a sub-package, links internal packages, builds sub-deps and the target dep by running their `prepare` scripts. 

### Important: Do not use `npm ci` or `npm install` for monorepo sub-packages. 

Normal `npm ci` and `npm install` commmands *will not work* within a sub-package e.g. `packages/streamr-client`, because `npm` doesn't know how to deal with the monorepo sub-package linking.

```bash
# from top level
npm run bootstrap-pkg $PACKAGE_NAME

# e.g.  
npm run bootstrap-pkg streamr-client 
npm run bootstrap-pkg streamr-network
```

## Regenerate lockfiles

Note that `bootstrap-pkg` won't generate `package-lock.json` for you. To (re)generate lockfiles use `bootstrap`.

```bash
# from top level
npm run boostrap 
```

If generating the `package-lock.json` creates a particularly noisy diff, you may want to remove all `node_modules` from every sub-package before (re)running `bootstrap`. See below.

## Clean `node_modules`

This removes all `node_modules` from each sub-package. This seems to produce cleaner `package-lock.json` diffs.

```bash
# from top level
npm run clean
# then optionally
npm run bootstrap
```

## Install an npm/internal dependency into a sub-package

Manually add the package + version to the appropriate `package.json` and run `npm run bootstrap-pkg $PACKAGE_NAME`. 

Alternatively, this may work:

```bash
# from top level
npx lerna add $NPM_DEP --scope $PACKAGE_NAME

# e.g.
npx lerna add express --scope stream-network
```

## List active versions & symlinks

Check which packages are currently being symlinked.

```bash
# from top level
npm run versions
```

This lists internal packages & their versions on the left, linked packages are columns.
If the package on the left links to the package in the column, it shows a checkmark & the semver range, otherwise it shows the mismatched semver range and prints a warning at the end.
It prints the version ranges so you can double-check that they're formatted as you expect e.g. `^X.Y.Z` vs `X.Y.Z`

![image](https://user-images.githubusercontent.com/43438/120851127-6b173e00-c546-11eb-8b2e-0fcd33d0da5a.png)
