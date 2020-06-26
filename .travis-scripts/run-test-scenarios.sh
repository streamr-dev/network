#!/usr/bin/env bash

# Run all test scenarios
# TODO: remove -c config/java-only.conf once everything works on JS client too
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -m test -s stream-cleartext-unsigned && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -m test -s stream-cleartext-signed && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -m test -s stream-encrypted-shared-signed -c config/java-only.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -m test -s stream-encrypted-shared-rotating-signed -c config/java-only.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -m test -s stream-encrypted-exchanged-rotating-signed -c config/java-only.conf && \
java -jar build/libs/client_testing-1.0-SNAPSHOT.jar -m test -s stream-encrypted-exchanged-rotating-revoking-signed -c config/java-only.conf
