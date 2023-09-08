#!/bin/bash
for i in {1..100}; do
    echo "Attempt: $i"
    DEBUG=Streamr* npx jest --forceExit $1
    if [[ "$?" != '0' ]]; then
        echo 'Test-fail'
        echo "Exit after $i attempts"
        break
    else
	   echo 'Test-success'
    fi
done
