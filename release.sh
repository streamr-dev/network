#!/bin/bash

NPM_TAG=$1

if [[ "$1" == "" ]]; then
    echo 'usage: release.sh <NPM_TAG>'
    exit 1
fi

cd packages/utils
npm publish --access public --tag $NPM_TAG --dry-run
cd ../..

cd packages/test-utils
npm publish --access public --tag $NPM_TAG --dry-run
cd ../..

cd packages/protocol
npm publish --access public --tag $NPM_TAG --dry-run
cd ../..

cd packages/network
npm publish --access public --tag $NPM_TAG --dry-run
cd ../..

cd packages/network-tracker
npm publish --access public --tag $NPM_TAG --dry-run
cd ../..

# Publishing client is a bit more complicated
cd packages/client
npm run build-production
cd dist
npm publish --tag $NPM_TAG --dry-run
cd ../../..

cd packages/cli-tools
npm publish --tag $NPM_TAG --access public --dry-run
cd ../..
