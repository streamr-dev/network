#!/usr/bin/env bash
set -e

sudo /etc/init.d/mysql stop
if [ ! -d streamr-docker-dev ]; then # Skip clone on subsequent attemps.
	git clone https://github.com/streamr-dev/streamr-docker-dev.git
fi
## Switch EE tag to the one built locally
sed -i "s#$OWNER/$IMAGE_NAME:dev#$OWNER/$IMAGE_NAME\:local#g" $TRAVIS_BUILD_DIR/streamr-docker-dev/docker-compose.override.yml
sudo ifconfig docker0 10.200.10.1/24
$TRAVIS_BUILD_DIR/streamr-docker-dev/streamr-docker-dev/bin.sh start broker-node-no-storage-1 smart-contracts-init nginx --wait

## Get testing Tool
git clone https://github.com/streamr-dev/streamr-client-testing.git
cd $TRAVIS_BUILD_DIR/streamr-client-testing
## Switch client library versions to production versions
sed -i "s/com.streamr:client:1.3.0/com.streamr:client:+/g" build.gradle
sed -i "s/\"streamr-client\": \"\^3.1.2\"/\"streamr-client\":\"latest\"/g" package.json
## Install npm packages
npm install
## build Jar
gradle fatjar
## Run Test
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-encrypted-shared-rotating-signed -m test

