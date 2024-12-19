#!/bin/bash

# If TypeDoc succeeds, it creates the directory with markdown files that Docusaurus uses to generate the API docs.
# If TypeDoc fails, Docusaurus ignores the error, builds the site without API docs, and the "npm run build"
# script still returns 0. This is why this separate smoke test is needed.

if [ ! -d "docs/usage/sdk/api" ]; then
    echo 'No files in "docs/usage/sdk/api" directory. Maybe TypeDoc failed?'
    exit 1
fi