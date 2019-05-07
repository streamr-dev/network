# Streamr Command Line Tools

Command line tool for interacting with [Streamr](https://www.streamr.com).

## Installation

```
npm install -g @streamr/cli-tools
```

## Releasing

```
npm publish --access=public
```

## Usage
To get a list of all (sub)commands simply run `streamr`.

All (sub)commands follow pattern `streamr <command>`.

Run `streamr help <command>` or `streamr <command> --help` to get more information about a a command, its options, and
so forth.

### listen
Used to subscribe to a stream and output real-time JSON objects to stdout line-by-line.

For example, to listen to a public stream such as the tram demo do
```
streamr listen 7wa7APtlTq6EC5iTCBy6dw
```

To listen to a private stream:

```
streamr listen streamId apiKey
```

Flag `--dev` or `--stg` can be enabled for the command to operate on pre-defined development or staging environment.


###  publish
Used to publish events to a stream from stdin line-by-line. Each line should be a valid JSON object.

Example of use:
```
streamr publish streamId apiKey
```

Flag `--dev` or `--stg` can be enabled for the command to operate on pre-defined development or staging environment.


### generate
Generate random JSON objects to stdout line-by-line.

Useful for generating test data to be published to a stream with `publish`, e.g.:
```
streamr generate | streamr publish streamId apiKey
```

### Piping with listen and publish

You can use the piping facilities of your *nix operating system with commands `publish` and `listen` to achieve some
useful operations. Below is a list of some ideas.

#### Use Case: Listening to a stream from any programming language
You can pipe the line-by-line JSON objects output by `listen` to
your program written in any language. Just make the program read JSON objects
from stdin.
```
streamr listen 7wa7APtlTq6EC5iTCBy6dw | ruby calculate-average-speed.rb
```

#### Use Case: Publishing to a stream from any programming language
If your program produces JSON objects to stdout (line-by-line), you can
redirect it to command `publish` to publish the JSON objects to a stream.
```
python printSensorReadingsAsJson.py | streamr publish streamId apiKey
```

#### Use Case: Transforming streams
You can also listen to a stream, apply a transformation, and then pipe the
transformed output into another stream.
```
streamr listen sourceStream | ./calculateMovingAverages | streamr publish destinationStream apiKey
```

Same rules apply here as before. Your program should accept line-by-line JSON
objects via stdin and output JSON objects to stdout line-by-line.

#### Use Case: Copying a production stream into development environment
If you have a working stream in production that you'd also like to use in your
development environment, you can combine the `listen` and `publish` commands to effectively copy
the real-time events.
```
streamr listen 7wa7APtlTq6EC5iTCBy6dw | streamr publish --dev streamId apiKey
```

And the same for staging environment:
```
streamr listen 7wa7APtlTq6EC5iTCBy6dw | streamr publish --stg streamId apiKey
```

## Developing
This CLI tool is basically a thin wrapper around [streamr-client-javascript](https://github.com/streamr-dev/streamr-client-javascript),
which does all the heavy lifting.

The code of this tool concentrates more on the CLI concerns: parsing and
passing arguments, stdin/stdout, errors, and so forth.

## Contributing
See issues, especially those tagged with "help wanted". We welcome pull
requests and issues.
