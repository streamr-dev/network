<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header.png" width="1320" />
  </a>
</p>

# Network

Monorepo containing all the main components of Streamr Network.

## Table of Contents
- [Packages](#packages)
- [NPM scripts](#npm-scripts)
- [Environment variables](#environment-variables)
- [Release](#release)

## Packages

### User-Facing
* [broker](packages/broker/README.md) (streamr-broker)
* [client](packages/client/README.md) (streamr-client)
* [cli-tools](packages/cli-tools/README.md) (@streamr/cli-tools)

### Internal
* [network-node](packages/network/README.md) (@streamr/network-node)
* [network-tracker](packages/network-tracker/README.md) (@streamr/network-tracker)
* [protocol](packages/protocol/README.md) (@streamr/protocol)
* [utils](packages/utils/README.md) (@streamr/utils)
* [test-utils](packages/test-utils/README.md) (@streamr/test-utils)
* [browser-test-runner](packages/browser-test-runner/index.js) (@streamr/browser-test-runner)

## NPM scripts
| Node.js `16.13.x` is the minimum required version. Node.js `18.12.x`, NPM `8.x` and later versions are recommended. |
|---------------------------------------------------------------------------------------------------------------------|

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

## Environment variables

| Variable                     | Description                                                                            | Packages                                    |
|------------------------------|----------------------------------------------------------------------------------------|---------------------------------------------|
| `BROWSER_TEST_DEBUG_MODE`    | Leaves the Electron window open while running browser tests                            | utils, proto-rpc, dht, network-node, client |
| `STREAMR_DOCKER_DEV_HOST`    | Sets an alternative IP address for streamr-docker-dev in end-to-end tests              | client, broker                              |
| `LOG_LEVEL`                  | Adjust logging level                                                                   | _all_                                       |
| `DISABLE_PRETTY_LOG`         | Set to true to disable pretty printing of logs and print JSONL instead                 | _all_                                       |
| `LOG_COLORS`                 | Set to false to disable coloring of log messages                                       | _all_                                       |
| `NOLOG`                      | Set to true to disable all logging                                                     | _all_                                       |
| `NODE_DATACHANNEL_LOG_LEVEL` | Adjust logging level of `node-datachannel` library                                     | network-node                                |
| `BUNDLE_ANALYSIS`            | Whether to produce a bundle analysis when building client package for browser          | client (compile time)                       |
| `STREAMR__BROKER__`          | Wildcard [set of variables](packages/broker/configuration.md) used to configure broker | broker                                      |

## Release

### utils, test-utils, protocol, network-tracker, network-node, client, cli-tools

All the above packages are released at the same time.

1. `git checkout main && git pull`
2. (skip if beta) Read [CHANGELOG](CHANGELOG.md), decide new version, and edit file.
3. `./update-versions.sh <SEMVER>` E.g. `./update-versions.sh 7.1.1`
4. `npm run clean && npm install && npm run build && npm run versions`
   - Ensure output does not contain yellow or red markers
5. Add files to staging `git add . -p`
6. `./release-git-tags.sh <SEMVER>` E.g. `./release-git-tags.sh 7.1.1`
7. Wait for pushed commit to pass CI validation
8. Publish packages `./release.sh <NPM_TAG>`
    - Use argument `beta` if publishing a beta version
    - Use argument `latest` if publishing a stable version
9. Update client API docs if major or minor change:
```bash
cd packages/client
npm run docs
aws s3 cp ./docs s3://api-docs.streamr.network/client/vX.Y --recursive --profile streamr-api-docs-upload
```

### broker

Broker is released independently of other packages because it follows its own versioning
for the time being.

```shell
git checkout main && git pull
cd packages/broker
# Read CHANGELOG.md, decide new version, and edit file
npm version <SEMVER_OPTION>
git add package.json ../../package-lock.json CHANGELOG.md
git commit -m "release(broker): vX.Y.Z"
git tag broker/vX.Y.Z
git push --atomic origin main broker/vX.Y.Z

npm run build
npm publish
```

#### Docker release

After pushing the broker tag, GitHub Actions will build and publish the Docker image automatically if
tests pass.

##### Tag `latest`

GitHub Actions will not update the `latest` tag. This must be done manually. Keep in mind that `latest` should
always refer to the latest _stable_ version.

To update `latest` do the following.

1. Remove potentially existing latest tag _locally_ with `docker manifest rm streamr/broker-node:latest`

1. Find out the sha256 digests of both the amd64 and arm64 builds for a `vX.Y.Z` tag. This can be
done via command-line `docker buildx imagetools inspect streamr/broker-node:vX.Y.Z` or you can check
this from docker hub website under https://hub.docker.com/r/streamr/broker-node/tags.
2. Then we shall create the manifest by running the below. Remember to replace `<SHA-AMD64>` and `<SHA-ARM64>`
with real values.
```
docker manifest create streamr/broker-node:latest \
    --amend streamr/broker-node@sha256:<SHA-AMD64> \
    --amend streamr/broker-node@sha256:<SHA-ARM64>
```
3. Then we publish the manifest with
```
docker manifest push streamr/broker-node:latest
```
4. Then we are ready. It would be wise to double-check this by checking
https://hub.docker.com/r/streamr/broker-node/tags.
