#!/bin/bash

# A hack to deal with "quick-lru" package being an ESM module. Copies the
# package from folder "node_modules" into "vendor" leaving out "package.json".
# TODO: remove when client package converted to ESM package

SRCDIR=`node -p "path.dirname(require.resolve('quick-lru'))"`
mkdir -p vendor/quick-lru
cp -n $SRCDIR/index.d.ts vendor/quick-lru
cp -n $SRCDIR/index.js vendor/quick-lru
true
