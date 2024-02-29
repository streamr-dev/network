#!/bin/bash
set -e

VERSION=$1

if [[ "$1" == "" ]]; then
    echo 'usage: release-git-tags.sh <SEMVER>'
    exit 1
fi

# Exit early if version is wrong
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-(beta|rc)\.[0-9]+)?$ ]]; then
    echo "Error: Invalid version"
    exit 1
fi

TAG=v$1

# Exit early if tags already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Error: Tag '$TAG' already exists."
    exit 1
fi

git commit -m "release: $TAG"
git tag $TAG
git tag broker/$TAG # TODO: This tag needed to activate tagged release of docker images, remove once 1.0 merged to main
git push --atomic origin main $TAG broker/$TAG
