#!/bin/bash
if [ $# -ne 2 ]; then
    echo "need 2 arguments: <health-check-url> <docker-image-name>"
    exit 1
fi
for (( i=0; i < 5; i=i+1 )); do
    docker inspect --format '{{json .State.Health }}' $2
    curl -s $1;
    res=$?;
    if test "$res" != "0"; then
        echo "Attempting to connect to $1 retrying in $wait_time seconds";
        sleep $wait_time;
        wait_time=$(( 2*wait_time )) ;
    else
        exit 0
    fi;
done;
exit 1
