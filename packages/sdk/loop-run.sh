#!/bin/bash
for i in {1..30}; do
    LOG_LEVEL=fatal node dist/src/test.js
    if [[ "$?" != '0' ]]; then
        echo 'Test-fail'
        echo "Exit after $i attempts"
        break
    fi
done
