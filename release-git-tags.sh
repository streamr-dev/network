#!/bin/bash
set -e

VERSION=$1

if [[ "$1" == "" ]]; then
    echo 'usage: release-git-tags.sh <SEMVER>'
    exit 1
fi

# Exit early if version is wrong
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]]; then
    echo "Error: Invalid version"
    exit 1
fi

CLIENT_TAG=client/v$1
CLI_TOOLS_TAG=cli-tools/v$1

# Exit early if tags already exist
if git rev-parse "$CLIENT_TAG" >/dev/null 2>&1; then
    echo "Error: Tag '$CLIENT_TAG' already exists."
    exit 1
fi
if git rev-parse "$CLI_TOOLS_TAG" >/dev/null 2>&1; then
    echo "Error: Tag '$CLI_TOOLS_TAG' already exists."
    exit 1
fi

git commit -m "release(client, cli-tools): v$1"
git tag client/v$1
git tag cli-tools/v$1
git push --atomic origin main client/v$1 cli-tools/v$1
