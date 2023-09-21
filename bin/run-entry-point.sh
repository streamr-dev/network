#!/bin/bash

# move to the directory where this script is located so that we can use relative paths
cd "${0%/*}"

cd ../packages/broker/dist/bin

chmod +x entry-point.js

./entry-point.js $1
