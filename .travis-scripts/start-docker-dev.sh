#!/usr/bin/env bash
set -e

sudo /etc/init.d/mysql stop
if [ ! -d streamr-docker-dev ]; then # Skip clone on subsequent attemps.
	git clone https://github.com/streamr-dev/streamr-docker-dev.git
fi
if [ "$1" == "production" ]; then
    sed -i "s/broker-node:dev/broker-node:latest/g" $TRAVIS_BUILD_DIR/streamr-docker-dev/docker-compose.override.yml
    sed -i "s/engine-and-editor:dev/engine-and-editor:latest/g" $TRAVIS_BUILD_DIR/streamr-docker-dev/docker-compose.override.yml
    sed -i "s/ethereum-watcher:dev/ethereum-watcher:latest/g" $TRAVIS_BUILD_DIR/streamr-docker-dev/docker-compose.override.yml
    sed -i "s/data-union-server:dev/data-union-server:latest/g" $TRAVIS_BUILD_DIR/streamr-docker-dev/docker-compose.override.yml
    sed -i "s/platform:dev/platform:latest/g" $TRAVIS_BUILD_DIR/streamr-docker-dev/docker-compose.override.yml
    cat $TRAVIS_BUILD_DIR/streamr-docker-dev/docker-compose.override.yml
fi
sudo ifconfig docker0 10.200.10.1/24

"$TRAVIS_BUILD_DIR/streamr-docker-dev/streamr-docker-dev/bin.sh" start smart-contracts-init nginx engine-and-editor --wait