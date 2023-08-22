#!/bin/bash
set -e

VERSION=$1

if [[ "$1" == "" ]]; then
    echo 'usage: release-git-tags.sh <SEMVER>'
    exit 1
fi

# Exit early if version is wrong
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-(tatum|beta)\.[0-9]+)?$ ]]; then
    echo "Error: Invalid version"
    exit 1
fi

TAG=v$1

# Exit early if tags already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Error: Tag '$TAG' already exists."
    exit 1
fi

git commit -m "release: v$1"
git tag $TAG
git push --atomic origin streamr-1.0 $TAG
