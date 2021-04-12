# @streamr/cli-tools

Command line tool for interacting with [Streamr](https://streamr.network).

See [Changelog](CHANGELOG.md) for version information and changes.

## Table of Contents
- [Install](#install)
- [Use](#use)
- [Develop](#develop)
- [Release](#release)
- [Contribute](#contribute)

## Install

```
npm install -g @streamr/cli-tools
```

## Use
All commands follow pattern `streamr <command> <subcommand>`, e.g.
```
streamr stream subscribe
streamr mock-data generate
```

To get a list of all commands simply run `streamr`. To list subcommands run e.g. `streamr stream`

Run `streamr <command> <subcommand> --help` to get more information about a a command, its options, and so forth.

### subscribe
Used to subscribe to a stream and output real-time JSON objects to stdout line-by-line.

For example, to subscribe to a public stream such as the tram demo do
```
streamr stream subscribe 7wa7APtlTq6EC5iTCBy6dw
```

To subscribe to a private stream and authenticate with an Ethereum private key:

```
streamr stream subscribe streamId --private-key <key>
```

Flag `--dev` or `--stg` can be enabled for the command to operate on pre-defined development or staging environment. Alternatively, you can give `--ws-url <url>` and `--http-url <url>` to connect to any custom network.


###  publish
Used to publish events to a stream from stdin line-by-line. Each line should be a valid JSON object.

Example of use:
```
streamr stream publish <streamId> --private-key <key>
```

Flag `--dev` or `--stg` can be enabled for the command to operate on pre-defined development or staging environment.


### generate
Generate random JSON objects to stdout line-by-line.

Useful for generating test data to be published to a stream with `publish`, e.g.:
```
streamr mock-data generate | streamr stream publish <streamId> --private-key <key>
```

### list
Fetch a list of streams that are accessible to the user authenticated by the private key
```
streamr stream list --private-key <key>
```

### show
Show detailed information about a specific stream
```
streamr stream show <streamId> --private-key <key>
```

### create
Create a new stream
```
streamr stream create <name> --private-key <key>
```

### resend
Request a resend of historical data printed as JSON objects to stdout line-by-line.

For example, to fetch the 10 latest messages of a public stream such as the tram demo do
```
streamr stream resend last 10 7wa7APtlTq6EC5iTCBy6dw
```


To fetch data starting from a particular date-time
```
streamr stream resend from 2019-05-10T17:00:00 <streamId> --private-key <key>
```

To fetch data between two date-times
```
streamr stream resend range 2019-05-10T17:00:00 2019-05-11T21:00:00 <streamId> --private-key <key>
```

Flag `--dev` or `--stg` can be enabled for the command to operate on pre-defined development or staging environment.


### Examples: Piping with subscribe and publish

You can use the piping facilities of your *nix operating system with commands `publish` and `subscribe` to achieve some
useful operations. Below is a list of some ideas.

#### Subscribing to a stream from any programming language
You can pipe the line-by-line JSON objects output by `subscribe` to
your program written in any language. Just make the program read JSON objects
from stdin.
```
streamr stream subscribe 7wa7APtlTq6EC5iTCBy6dw | ruby calculate-average-speed.rb
```

#### Publishing to a stream from any programming language
If your program produces JSON objects to stdout (line-by-line), you can
redirect it to command `publish` to publish the JSON objects to a stream.
```
python printSensorReadingsAsJson.py | streamr stream publish <streamId> --private-key <key>
```

#### Transforming streams
You can also subscribe to a stream, apply a transformation, and then pipe the
transformed output into another stream.
```
streamr stream subscribe <sourceStream> | ./calculateMovingAverages | streamr stream publish <destinationStream> --private-key <key>
```

Same rules apply here as before. Your program should accept line-by-line JSON
objects via stdin and output JSON objects to stdout line-by-line.

#### Copying a production stream into development environment
If you have a working stream in production that you'd also like to use in your
development environment, you can combine the `subscribe` and `publish` commands to effectively copy
the real-time events.
```
streamr stream subscribe 7wa7APtlTq6EC5iTCBy6dw | streamr stream publish --dev <streamId> --private-key <key>
```

And the same for staging environment:
```
streamr stream subscribe 7wa7APtlTq6EC5iTCBy6dw | streamr stream publish --stg <streamId> --private-key <key>
```

## Develop
This project is a thin wrapper around [streamr-client-javascript](https://github.com/streamr-dev/streamr-client-javascript),
which does the heavy lifting, while this project concentrates on CLI concerns: parsing and
passing arguments, stdin/stdout, errors, and so forth.

### Release
```
npm publish --access=public
```

## Contribute
See issues, especially those tagged with "help wanted". We welcome pull requests and issues.
