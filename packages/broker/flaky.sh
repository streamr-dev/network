#!/bin/bash
for i in {1..100}; do
    npx jest --silent test/integration/plugins/storage/Storage.test.ts -t 'multiple buckets'
    if [[ "$?" != '0' ]]; then
        echo "Failed after $i attempts"
        break
    fi
done
