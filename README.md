# listen-to-stream

Command line tool for listening to [Streamr](https://www.streamr.com) streams. Outputs events to stdout.

## Installation

```
npm install -g @streamr/listen-to-stream
```

## Usage


### Public stream
To listen to a public stream such as the Public transport demo:

```
listen-to-stream 7wa7APtlTq6EC5iTCBy6dw
```

### Private stream
Listen to a private stream:

```
listen-to-stream streamId apiKey
```

where _apiKey_ is the key of the user or stream with READ privilege.

### Development environment stream
Listen to a development environment stream
```
listen-to-stream streamId apiKey ws://localhost:8890/api/v1/ws http://localhost:8081/streamr-core/api/v1
```

or

```
listen-to-stream-dev streamId apiKey
```

## Publishing

```
npm publish --access=public
```
