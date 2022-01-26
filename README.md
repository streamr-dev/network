<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header-img.png" width="1320" />
  </a>
</p>

# Streamr Network + Client Monorepo

Streamr network, broker, client & supporting packages.

## Contains

* [network](packages/network/README.md) (streamr-network)
* [broker](packages/broker/README.md) (streamr-broker)
* [client](packages/client/README.md) (streamr-client)
* [protocol](packages/protocol/README.md) (streamr-client-protocol)
* [test-utils](packages/test-utils/README.md) (streamr-test-utils)
* [cli-tools](packages/cli-tools/README.md) (@streamr/cli-tools)

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
by running their `prepare` scripts.

### Important: Do not use `npm ci` or `npm install` in monorepo sub-package directories.

Normal `npm ci` and `npm install` commmands will not work properly within a sub-package e.g. `packages/streamr-client`, because `npm` doesn't know how to deal with the monorepo sub-package linking.

```bash
# from top level
npm run bootstrap-pkg $PACKAGE_NAME

# e.g.
npm run bootstrap-pkg streamr-client
npm run bootstrap-pkg streamr-network
```

## Regenerate lockfile

```bash
# from top level
npm run clean-lockfiles

```

## Clean Cached/Built Files

This cleans all cache and `dist` directories from each sub-package.

```bash
# from top level
npm run clean-dist # also clears cache
# alternatively, just clear cache:
npm run clean-cache
```

## Clean All

This removes all cached/built files and `node_modules` from each
sub-package, and the top-level node_modules.  You will need to run `npm
ci` (honour package-lock), `npm install` (update package-lock) or `npm
run bootstrap` (only install top-level packages) before proceeding.

```bash
# from top level
npm run clean
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

## Important changes to the bootstrap/install scripts as of 48e165f:

### Key Changes

* The monorepo is now using `npm workspaces` instead of `lerna`.
* Use `npm@8`, workspaces on `npm@7` are buggy.
* Learn about npm workspaces: https://docs.npmjs.com/cli/v8/using-npm/workspaces
* Ensure you know about and understand these npm flags:
  [`--workspaces`](https://docs.npmjs.com/cli/v8/using-npm/config#workspaces),
  [`--include-workspace-root`](https://docs.npmjs.com/cli/v8/using-npm/config#include-workspace-root)
  and
  [`--workspace`](https://docs.npmjs.com/cli/v8/using-npm/config#workspace),
  as well as how they work with [`npm
  install`](https://docs.npmjs.com/cli/v8/commands/npm-install#workspace)
  and [`npx`/`npm
  exec`](https://docs.npmjs.com/cli/v8/commands/npm-exec#workspaces-support).
* `npm ci` will install everything. `npm run bootstrap` is `npm ci`.
* You can now bootstrap individual workspaces like `npm run
  bootstrap-pkg streamr-network`, without running anything else
  beforehand. No `npm ci`, `npm install` or `npm run bootstrap` needed.
  `bootstrap-pkg` installs both top-level and sub-dependencies. This is
  equivalent to what `npm ci && npm run bootstrap-pkg streamr-network`
  used to do.
* To install dependencies into a sub-package you should use `npm install
  --workspace` from the top-level, with the name of the sub-package you
  want to update. e.g. `npm install --workspace=streamr-network`, or
  just regular `npm install` at the top-level to install everything.
  It's possible these two commands will generate different package-lock
  results 🤷 .
* `npm run bootstrap-root` Removes dist/cache & any sub-package
  dependencies from `node_modules`, leaving `package-lock.json` and
  `package.json` alone.  Use when you (only) want to be able to run
  top-level scripts e.g. `npm run versions` without installing anything
  else.
* `npm run eslint` runs `eslint` for all packages. This runs as a
  git push hook.
* `npm run versions` also run `manypkg check`. This lints package.json
  to do things like ensure all packages are using the same versions of
  dependencies. e.g. same version of TS in every package.

### Before/After Comparison

|  Command      |  After (using `npm` workspaces) | Before (using `lerna`) |
| ------------ | ----------- | ----------- |
| `npm ci`      |  Installs all top-level dependencies AND sub-packages according to top-level `package-lock.json` | Installs only top-level dependencies e.g. `lerna`  according to top-level `package-lock.json` |
| `npm install`      | Installs all top-level dependencies AND sub-packages and updates `package-lock.json`. Will install new sub-package dependencies. |  Installs only top-level dependencies and updates `package-lock.json`
| `npm run bootstrap`   | Runs `npm ci`. | Installs dependencies for sub-packages using `lerna`. Unclear whether package-lock is used, but it will update `package-lock.json`.  |
| `npm run bootstrap-pkg streamr-network`      | Installs top-level dependencies AND the dependencies for a sub-package using package-lock. Does not update `package-lock.json`. Will not install new sub-package dependencies. | Installs dependencies for a sub-package using `lerna`. Unclear if package-lock is used. Does not update `package-lock.json`. |
| `npm install --include-workspace-root --workspace streamr-network`       | Installs top-level dependencies (`--include-workspace-root`) AND the dependencies for a sub-package. Will update `package-lock.json`. Will install new sub-package dependencies.  | N/A but roughly equivalent to running this in the old setup: `npm install && npm run bootstrap-pkg streamr-network` |
| `npm run clean-dist`       | Removes cache and `dist` from sub-packages. Removes cache from top-level. | Removes cache and `dist` from sub-packages. |
| `npm run clean`      |  Removes all cache, dist & packages from root & sub-package `node_modules/`, except those packages needed by the top-level `package.json` e.g. `zx`. |  Runs `npm run clean-dist` and `npm run bootstrap-root`. |
| `npm run prune-pkg streamr-broker`      | Removes all packages except the production deps needed by the specified package's `package.json`. Note they will be installed in the top-level `node_modules/` not `packages/*/node_modules/` | N/A, roughly equivalent to `cd packages/streamr-broker/ && npm prune --production`
| `npm run bootstrap-root`      | Removes all packages except those needed by top-level `package.json`. | N/A, roughly equivalent to `npm ci && npm run clean`
| `npm run fix` | Runs `eslint --fix` in all packages and `manypkg fix`. | N/A |
| `npm run clean-package-locks` | Removes only top-level package-lock.  There should only be a single top-level package-lock. | Removes all package locks in all packages. |

Left `lerna` in the tree because `lerna` works best for implementing the `npm run versions` script.
