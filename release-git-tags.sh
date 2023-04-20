#!/bin/bash
set -e

VERSION=$1

if [[ "$1" == "" ]]; then
    echo 'usage: release-git-tags.sh <SEMVER>'
    exit 1
fi

git commit -m "release(client, cli-tools): v$1"
git tag client/v$1
git tag cli-tools/v$1
git push --atomic origin main client/v$1 cli-tools/v$1
