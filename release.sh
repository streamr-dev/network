#!/bin/bash
cd packages/utils
npm publish --access public --dry-run
cd ../..

cd packages/test-utils
npm publish --access public --dry-run
cd ../..

cd packages/protocol
npm publish --access public --dry-run
cd ../..

cd packages/network
npm publish --access public --dry-run
cd ../..

cd packages/network-tracker
npm publish --access public --dry-run
cd ../..

# Publishing client is a bit more complicated
cd packages/client
npm run build-production
cd dist
npm publish --dry-run
cd ../../..

cd packages/cli-tools
npm publish --access public --dry-run
cd ../..
