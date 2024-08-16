#!/bin/bash
for i in {1..30}; do
    node dist/src/test.js $1
    if [[ "$?" != '0' ]]; then
        echo 'Test-fail'
        echo "Exit after $i attempts"
        break
    fi
done