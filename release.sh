#!/bin/bash

NPM_TAG=$1

if [[ "$1" == "" ]]; then
    echo 'usage: release.sh <NPM_TAG>'
    exit 1
fi

# check that there was some tag value selected in the manual workflow UI (see publish-npm.yml)
if [[ "$1" == "SELECT" ]]; then
    echo 'invalid value for "tag"'
    exit 1
fi

npm run build

cd packages/utils || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/test-utils || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/cdn-location || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/geoip-location || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/proto-rpc || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/autocertifier-client || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/dht || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/autocertifier-server || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/trackerless-network || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/sdk || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/node || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/cli-tools || exit
npm publish --access public --tag $NPM_TAG
cd ../..
