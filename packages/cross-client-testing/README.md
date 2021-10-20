# Streamr client libraries end-to-end testing

This tool allows to run/test different stream setups using the developed client libraries. These setups can be either part of the CI or run indefinitely against the staging environment to better mock the production environment.

## Stream setups

A 'stream setup' is basically a scenario. It consists of a test stream and a set of participants (publishers + subscribers) using this stream. The publishers can be created with different parameters:
- The library used (Java or Javascript at the moment)
- Publication rate
- Signing data or not
- Encrypting data or not
- if encrypting data, periodically rotating the key or not (forward secrecy)

The subscribers as well can be created with different parameters:
- The library used (Only Java or Javascript now)
- subscribing only to real-time, or with resend from a specific time, or resend the last n messages
- Verifying signatures or not
- If encrypted, using a group key shared by the publisher or using the key-exchange mechanism

The different parameters allow to test different scenarios. For example one stream with 3 Java publishers, 2 JS publishers, 5 Java subscribers and 1 JS subscriber. One publisher shares his group key with the subscribers, the others use the key-exchange mechanism, some rotate the key and some don't, etc...

## Building

Build both the JS and Java parts:

```
make install
```

## Usage

Gradle distribution's wrapper script can be called to execute the client_testing application:
`client_testing-1.0-SNAPSHOT/bin/client_testing com.streamr.client_testing.Main`

The app takes one required command-line argument:
- `-s`, `--stream`: The stream setup to run. Value should be one of the following (the names should be self-explanatory. See the code for more specifics and `application.conf` for the number of publishers/subscribers):
    - `"stream-cleartext-unsigned"`
    - `"stream-cleartext-signed"`
    - `"stream-encrypted-shared-signed"`
    - `"stream-encrypted-shared-rotating-signed"`
    - `"stream-encrypted-exchanged-rotating-signed"`

The other command line arguments are optional:

- `-c`, `--config`: Test config file. Defaults to `config/default.conf`
- `-n`, `--number-of-messages`: Number of messages that each publisher publishes in the test. Default 30.
- `-i`, `--infinite`: Infinitely runs the message production instead of the value given by `-n`
- `-r`, `--resturl`: REST API url to connect to. Example value in the case of local testing: `"http://localhost/api/v1"`
- `-w`, `--wsurl`: WebSockets API url to connect to. Example value in the case of local testing: `"ws://localhost/api/v1/ws"`

The client connection URLs, number of publishers and subscribers on each platform are set in a `.conf` file. The default is `config/default.conf`, and another file can be specific with the `--config` option.

Log level is configured in `src/main/resources/log4j2.xml`.

Run tests with `Makefile`: `TEST_NAME=stream-cleartext-unsigned CONFIG_NAME=java-only NUM_MESSAGES=5 make run`

### Late Subscribers with Resend

If the number of **subscribers** for each library as specified in the config file is greater than or equal to 3, then 2 of these subscribers will subscribe only after some delay and using a different resend option.

For example, if `nbJavaSubscribers=2`, the 2 subscribers will subscribe immediately in real-time. But if `nbJavaSubscribers=5`, 3 of them will subscribe immediately, but 1 will subscribe later with a "resend last option" and 1 other with a "resend from" option.

The following example will test locally that 2 Java subscribers and 4 JavaScript subscribers (2 of them with resend options) correctly receive messages from 3 Java publishers who sign, encrypt and rotate an initially shared key:

```
>> cat config/my-custom-config.conf

restUrl=http://localhost/api/v1
wsUrl=ws://localhost/api/v1/ws

nbJavaPublishers=3
nbJavaSubscribers=2
nbJavascriptPublishers=0
nbJavascriptSubscribers=4

>> TEST_NAME=stream-encrypted-shared-rotating-signed CONFIG_NAME=my-custom-config NUM_MESSAGES=2 make run
```

## Contributing

You can add/update/remove setups in `Streams.Java`. To support another Streamr client library (like Python), follow the convention and encapsulate your code in Java wrapper classes: `StreamrClientX extends StreamrClientWrapper`, `SubscriberX extends Subscriber`, `PublisherThreadX extends PublisherThread` where `X` is the programming language of the library to support.
