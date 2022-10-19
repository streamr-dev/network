#!/bin/bash
mkdir -p dist/
node copy-package.js
cp -f README.md LICENSE readme-header-img.png dist
mkdir -p dist/src/encryption/migrations
cp -f ./src/encryption/migrations/* dist/src/encryption/migrations
