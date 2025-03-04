#!/bin/bash

mkdir -p dist

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

cd "${SCRIPT_DIR}/.."

# Sanitize the final package.json
npx ts-node scripts/rewrite-package.ts
