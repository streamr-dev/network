#!/usr/bin/env bash

# Run all test scenarios
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-cleartext-unsigned -c config/default-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-cleartext-signed -c config/default-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-encrypted-shared-signed -c config/default-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-encrypted-shared-rotating-signed -c config/default-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-encrypted-exchanged-rotating-signed -c config/default-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-encrypted-exchanged-rotating-revoking-signed -c config/default-ci.conf
