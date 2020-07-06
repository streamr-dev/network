#!/usr/bin/env bash

# Run all test scenarios
# TODO: replace java-only.conf with default-ci.conf once everything works on JS client too
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-cleartext-unsigned -c config/default-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-cleartext-signed -c config/default-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-encrypted-shared-signed -c config/default-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-encrypted-shared-rotating-signed -c config/default-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-encrypted-exchanged-rotating-signed -c config/java-only-ci.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -s stream-encrypted-exchanged-rotating-revoking-signed -c config/java-only-ci.conf
