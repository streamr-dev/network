#!/bin/bash

# move to the directory where this script is located so that we can use relative paths
cd "${0%/*}"

./../packages/broker/dist/bin/entry-point.js
