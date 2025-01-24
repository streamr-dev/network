<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/sdk/readme-header.png" width="1320" />
  </a>
</p>

# Network

Monorepo containing the main components of Streamr Network.

## Table of Contents
- [Packages](#packages)
- [NPM scripts](#npm-scripts)
- [Environment variables](#environment-variables)
- [Release](#release)

## Packages

### User-Facing
* [node](packages/node/README.md) (@streamr/node)
* [sdk](packages/sdk/README.md) (@streamr/sdk)
* [cli-tools](packages/cli-tools/README.md) (@streamr/cli-tools)

### Internal
* [browser-test-runner](packages/browser-test-runner/index.js) (@streamr/browser-test-runner)
* [utils](packages/utils/README.md) (@streamr/utils)
* [test-utils](packages/test-utils/README.md) (@streamr/test-utils)
* [proto-rpc](packages/proto-rpc/README.md) (@streamr/proto-rpc)
* [autocertifier-client](packages/autocertifier-client/README.md) (@streamr/autocertifier-client)
* [dht](packages/dht/README.md) (@streamr/dht)
* [autocertifier-server](packages/autocertifier-server/README.md) (@streamr/autocertifier-server)
* [trackerless-network](packages/trackerless-network/README.md) (@streamr/trackerless-network)

## NPM scripts
Node.js version 20 is recommended.

The monorepo is managed using [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces).

Installation on an Apple Silicon Mac requires additional steps, see [install-on-apple-silicon.md](/internal-docs/install-on-apple-silicon.md).

**Important:** Do not use `npm ci` or `npm install` directly in the sub-package directories.

### Bootstrap all sub-packages
The go-to command for most use cases.

To install all required dependencies and build all sub-packages (linking sub-packages together as needed):

```bash
# from top level
npm run bootstrap
```

###  Bootstrap a single sub-package

To install the required dependencies and build a specific sub-package:

```bash
# from top level
npm run bootstrap-pkg --package=$PACKAGE_NAME
```

### Install dependencies only

To only install required dependencies and link sub-packages together (and skip build phase):

```bash
# from top level
npm ci
```

### Build
To build all sub-packages:
```bash
# from top level
npm run build
```

### Build a sub-package
To build a specific sub-package:
```bash
# from top level
npm run build --workspace=$PACKAGE_NAME
```

### Clear caches and built files

To clear all caches and remove the `dist` directory from each sub-package:

```bash
# from top level
npm run clean-dist
```

### Clean all

To removes all caches, built files, and **`node_modules`** of each sub-package, and the
top-level **`node_modules`**:

```bash
# from top level
npm run clean
```

### Add a dependency into a sub-package

Manually add the entry to the `package.json` of the sub-package and 
run `npm run bootstrap-pkg $PACKAGE_NAME`.

Alternatively, run:
```bash
npm install some-dependency --workspace=$PACKAGE_NAME
```

### List active versions & symlinks

Check which sub-packages are currently being symlinked.

```bash
# from top level
npm run versions
```

This lists sub-packages & their versions on the left, linked
sub-packages are columns.  If the package on the left links to the package
in the column, it shows a checkmark & the semver range, otherwise it
shows the mismatched semver range and prints a warning at the end.  It
prints the version ranges so you can double-check that they're formatted
as you expect e.g. `^X.Y.Z` vs `X.Y.Z`

![image](https://user-images.githubusercontent.com/43438/135347920-97d6e0e7-b86c-40ff-bfc9-91f160ae975c.png)

### Generate package-lock.json from scratch

Occasionally it can be useful to clear all the packages and generate
package-lock.json completely from scratch. To do this run the following.

```bash
npm run clean
rm -rf node_modules
rm package-lock.json
npm cache clean --force
npm install
```

## Environment variables

| Variable                     | Description                                                                        | Packages                                 |
|------------------------------|------------------------------------------------------------------------------------|------------------------------------------|
| `BROWSER_TEST_DEBUG_MODE`    | Leaves the Electron window open while running browser tests                        | utils, proto-rpc, dht, network-node, sdk |
| `STREAMR_DOCKER_DEV_HOST`    | Sets an alternative IP address for streamr-docker-dev in end-to-end tests          | sdk, node                                |
| `LOG_LEVEL`                  | Adjust logging level                                                               | _all_                                    |
| `DISABLE_PRETTY_LOG`         | Set to true to disable pretty printing of logs and print JSONL instead             | _all_                                    |
| `LOG_COLORS`                 | Set to false to disable coloring of log messages                                   | _all_                                    |
| `NOLOG`                      | Set to true to disable all logging                                                 | _all_                                    |
| `NODE_DATACHANNEL_LOG_LEVEL` | Adjust logging level of `node-datachannel` library                                 | network-node                             |
| `BUNDLE_ANALYSIS`            | Whether to produce a bundle analysis when building sdk package for browser         | sdk (compile time)                       |
| `STREAMR__BROKER__`          | Wildcard [set of variables](packages/node/configuration.md) used to configure node | node                                     |

## Release

All packages are released at the same time under the same version.

### Step 1: Edit the CHANGELOG
You can skip this step if releasing a beta version.

Read and edit [CHANGELOG.md](CHANGELOG.md). Create a new section for the new version, move items from under
"Unreleased" to this new section. Add any additional changes worth mentioning that may be missing from "Unreleased".


### Step 2: Creating and pushing the version and tag
In the bash commands below, replace `<SEMVER>` with the version to be published _without_ the letter "v" infront.

```
git checkout main
git pull
./update-versions.sh <SEMVER>                                        # e.g. ./update-versions.sh 7.1.1
npm run clean && npm install && npm run build && npm run versions    # Check that the output has not red or yellow markers
git add -p .                                                         # or "git add -all"
./release-git-tags.sh <SEMVER>                                       # e.g. `./release-git-tags.sh 7.1.1`
```

### Step 3: Publish NPM and release Docker image

Firstly, wait for all tests to pass in GitHub Actions.

To publish the NPM packages, use [publish-npm workflow](https://github.com/streamr-dev/network/actions/workflows/publish-npm.yml).
Click button "Run Workflow". Select the right branch and NPM tag to be used.

To publish the Docker image, use [release-docker workflow](https://github.com/streamr-dev/network/actions/workflows/release-docker.yml).
Click button "Run Workflow". Select the right branch and you are good to go. The Docker tags are automatically chosen based on
the associated Git branch and tag.

### Step 4: Releasing the docs

Firstly, ask yourself whether the docs need to be released or not.

To publish the docs, use [Production Documentation workflow](https://github.com/streamr-dev/network/actions/workflows/deploy-docs.yml).
Click button "Run workflow". Select the right branch and you are good to go.

### Manually adjusting Docker image tag `latest`

GitHub actions will update the `latest` tag if told to do so in the workflow dispatch drop-down menu.
If for whatever reason you want to manually change the `latest` tag, here are the instructions to do so.
Keep in mind that `latest` should always refer to the latest _stable_ version.

To update `latest` do the following.

1. Remove potentially existing latest tag _locally_ with `docker manifest rm streamr/node:latest`

1. Find out the sha256 digests of both the amd64 and arm64 builds for a `vX.Y.Z` tag. This can be
done via command-line `docker buildx imagetools inspect streamr/node:vX.Y.Z` or you can check
this from docker hub website under https://hub.docker.com/r/streamr/node/tags.
2. Then we shall create the manifest by running the below. Remember to replace `<SHA-AMD64>` and `<SHA-ARM64>`
with real values.
```
docker manifest create streamr/node:latest \
    --amend streamr/node@sha256:<SHA-AMD64> \
    --amend streamr/node@sha256:<SHA-ARM64>
```
3. Then we publish the manifest with
```
docker manifest push streamr/node:latest
```
4. Then we are ready. It would be wise to double-check this by checking
https://hub.docker.com/r/streamr/node/tags.
