#!/bin/bash

mkdir -p dist

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

cd "${SCRIPT_DIR}/.."

# Copy over the migrations
mkdir -p dist/src/encryption/migrations
cp -f src/encryption/migrations/* dist/src/encryption/migrations
