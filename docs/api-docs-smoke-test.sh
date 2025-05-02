#!/bin/bash

# If TypeDoc succeeds, it creates the directory with markdown files that Docusaurus uses to generate the API docs.
# If TypeDoc fails, Docusaurus ignores the error, builds the site without API docs, and the "npm run build"
# script still returns 0. This is why this separate smoke test is needed.

# Note that the TypeDoc can fail with only [warning] lines printed. In particular, if this smoke test failing,
# and the docs build prints lines like this:
#
# [warning] SignatureTypeString, defined in [...]/packages/sdk/src/Message.ts, is referenced by Message.signatureType but not included in the documentation
# [warning] Found 0 errors and 1 warnings
#
# Then adding the missing classes to exports.ts will probably fix the TypeDoc build.

if [ ! -d "docs/usage/sdk/api" ]; then
    echo 'No files in "docs/usage/sdk/api" directory. Maybe TypeDoc failed?'
    exit 1
fi