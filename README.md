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

### Listening to a stream

Commands `listen-to-stream` and `listen-to-stream-dev` are used to subscribe to
a stream and output real-time JSON objects to stdout line-by-line.

#### Public stream
To listen to a public stream such as the Public transport demo:

```
listen-to-stream 7wa7APtlTq6EC5iTCBy6dw
```

#### Private stream
To listen to a private stream:

```
listen-to-stream streamId apiKey
```

where _apiKey_ is the key of the user or stream with READ privilege.

#### Development environment stream
Listen to a development environment stream
```
listen-to-stream streamId apiKey ws://localhost:8890/api/v1/ws http://localhost:8081/streamr-core/api/v1
```

or shorthand (when running [streamr-docker-dev](https://github.com/streamr-dev/streamr-docker-dev) environment)

```
listen-to-stream-dev streamId apiKey
```

### Publishing to a stream
Commands `publish-to-stream` and `publish-to-stream-dev` are used to publish
events to a stream from stdin line-by-line. Each line should be a valid JSON
object.

#### Production
To publish to a stream:

```
publish-to-stream streamId apiKey
```

where _apiKey_ is the key of the user or stream with WRITE privilege.

#### Development environment
To publish to a development environment stream:
```
publish-to-stream streamId apiKey ws://localhost:8890/api/v1/ws http://localhost:8081/streamr-core/api/v1
```

or shorthand (when running [streamr-docker-dev](https://github.com/streamr-dev/streamr-docker-dev) environment)

```
publish-to-stream-dev streamId apiKey
```

### Generating random test JSON
To generate random JSON objects to stdout line-by-line :
```
generate-random-json
```
Useful for testing when piping to `listen-to-stream`.

### Use Cases: Combining *nix pipes with `publish-to-stream` and `listen-to-stream`
You can use the piping facilities of your *nix operating system with commands
`publish-to-stream` and `listen-to-stream` to achieve some interesting results.

#### Listening to a stream from any programming language
You can pipe the line-by-line JSON objects output by `listen-to-stream` to
your program written in any language. Just make the program read JSON objects
from stdin.

E.g. 
```
listen-to-stream 7wa7APtlTq6EC5iTCBy6dw | ruby calculate-average-speed.rb
```

#### Publishing to a stream from any programming language
If your program produces JSON objects to stdout (line-by-line), you can
redirect it to `publish-to-stream` to publish the JSON objects to a stream.

E.g.
```
python printSensorReadingsAsJson.py | publish-to-stream streamId apiKey
```

#### Transforming streams
You can also listen to a stream, apply an transformation, and then pipe the
transformed output into another stream.

E.g.
```
listen-to-stream sourceStream | ./calculateMovingAverages | publish-to-stream destinationStream apiKey
```

Same rules apply here as above: your program should accept line-by-line JSON
objects via stdin and output JSON objects to stdout line-by-line.

#### Copying a production stream into development environment
If you have a working stream in production that you'd also like to use in your
development environment, you can combine the two commands to effectively copy
the real-time events.

E.g.
```
listen-to-stream 7wa7APtlTq6EC5iTCBy6dw | publish-to-stream-dev streamId apiKey
```

You can also do the reverse:
```
listen-to-stream-dev devStreamId | publish-to-stream productionStreamId apiKey
```

## Developing
This CLI tool is basically a thin wrapper around [streamr-client-javascript](https://github.com/streamr-dev/streamr-client-javascript),
which does all the heavy lifting.

The code of this tool concentrates more on the CLI concerns: parsing and
passing arguments, stdin/stdout, errors, and so forth.

## Contributing
See issues, especially those tagged with "help wanted". We welcome pull
requests and issues.
