#!/bin/bash
for i in {1..100}; do
    LOG_LEVEL=warn node dist/src/test.js
    if [[ "$?" != '0' ]]; then
        echo 'Test-fail'
        echo "Exit after $i attempts"
        break
    fi
done
