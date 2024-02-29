#!/bin/bash

NPM_TAG=$1

if [[ "$1" == "" ]]; then
    echo 'usage: release.sh <NPM_TAG>'
    exit 1
fi

npm run build

# Build client's webpack bundle
cd packages/client || exit
npm run build-browser
if [ $? -ne 0 ]
then
    echo
    echo 'Client build failed, did not publish all packages!'
    echo
    exit 1
fi
cd ../..

cd packages/utils || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/test-utils || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/cdn-location || exit
npm publish --access public --tag $NPM_TAG
cd ../..

cd packages/protocol || exit
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

cd packages/client/dist || exit # Notice: dist folder
npm publish --access public --tag $NPM_TAG
cd ../../..

cd packages/broker || exit
npm publish --tag $NPM_TAG --access public
cd ../..

cd packages/cli-tools || exit
npm publish --tag $NPM_TAG --access public
cd ../..
