#!/bin/bash

set -e

## Script for preparing smoke test
sudo ifconfig docker0 10.200.10.1/24

## Get Streamr Docker dev
git clone https://github.com/streamr-dev/streamr-docker-dev.git

## Switch out image for local one
sed -i "s#$OWNER/$IMAGE_NAME:dev#$OWNER/$IMAGE_NAME\:taggit#g" $TRAVIS_BUILD_DIR/streamr-docker-dev/docker-compose.override.yml

## Start up services needed
$TRAVIS_BUILD_DIR/streamr-docker-dev/streamr-docker-dev/bin.sh start tracker-1 tracker-2 tracker-3 broker-no-node-storage-1

## Wait for the service to come online and test
wait_time=10;
for (( i=0; i < 5; i=i+1 )); do
    curl -s http://localhost:8891/api/v1/volume;
    res=$?;
    if test "$res" != "0"; then
        echo "Attempting to connect to broker retrying in $wait_time seconds";
        sleep $wait_time;
        wait_time=$(( 2*wait_time )) ;
    else
        exit 0
    fi;
done;
exit 1
