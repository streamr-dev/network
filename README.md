# Streamr client libraries end-to-end testing

This tool allows to run/test different stream setups using the developed client libraries (only Java supported at the moment). These setups can be either part of the CI or run indefinitely against the staging environment to better mock the production environment.

## Stream setups

A 'stream setup' is basically a scenario. It consists of a test stream and a set of participants (publishers + subscribers) using this stream. The publishers can be created with different parameters:
- The library used. (Only Java now)
- Publication rate
- Content published
- Signing data or not
- Encrypting data or not
- if encrypting data, periodically rotating the key or not (forward secrecy)

The subscribers as well can be created with different parameters:
- The library used (Only Java now)
- Verifying signatures or not
- If encrypted, using a group key shared by the publisher or using the key-exchange mechanism

The different parameters allow to test different scenarios. For example one stream with 3 Java publishers, 2 JS publishers, 5 Java subscribers and 1 JS subscriber. One publisher shares his group key with the subscribers, the others use the key-exchange mechanism, some rotate the key and some don't, etc...

## Usage

The script `streamr-client-testing.sh` takes 4 arguments:
- `-s`, `--stream`: The stream setup to run. Value should be one of the following (the names should be self-explanatory. See the code for more specifics, like number of publishers/subscribers):
    - `"stream-cleartext-unsigned"`
    - `"stream-cleartext-signed"`
    - `"stream-encrypted-shared-signed"`
    - `"stream-encrypted-shared-rotating-signed"`
    - `"stream-encrypted-exchanged-rotating-signed"`

- `-m`, `--mode`: determines how to run the stream setup. Value should be either `'run'` or `'test'`. In `'run'` mode, the stream setup is started and not stopped unless the process is killed (appropriate to continuously test staging). In `'test'` mode, the stream setup is run for 1 minute, after which it is stopped and a check is performed to assert that all subscribers have received all messages from all publishers in the correct order and that no exception was thrown in the process (appropriate to be part of the CI/CD pipeline).
- `-r`, `--resturl`: REST API url to connect to. Example value in the case of local testing: `"http://localhost/api/v1"`
- `-w`, `--wsurl`: WebSockets API url to connect to. Example value in the case of local testing: `"ws://localhost/api/v1/ws"`
