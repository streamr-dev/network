#!/bin/bash

mkdir -p dist

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

cd "${SCRIPT_DIR}/.."

# Sanitize the final package.json
npx tsx scripts/rewrite-package.ts

# Copy assets
cp -f README.md LICENSE readme-header.png dist

# Copy over the migrations
mkdir -p dist/src/encryption/migrations
cp -f src/encryption/migrations/* dist/src/encryption/migrations
