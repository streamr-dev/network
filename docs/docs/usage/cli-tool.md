---
sidebar_position: 4
---

# Streamr CLI tool

The Streamr Command line (CLI) tool is for interacting with the Streamr Network. Available on NPM, [@streamr/cli-tools](https://www.npmjs.com/package/@streamr/cli-tools).

### Install

```
npm install -g @streamr/cli-tools
```

Node.js `16.13.x` is the minimum required version. Node.js `18.12.x`, NPM `8.x` and later versions are recommended.

### Usage

All commands follow pattern `streamr <command> <subcommand>`, e.g.

```
streamr stream subscribe
streamr mock-data generate
```

To get a list of all commands simply run `streamr`. To list subcommands run e.g. `streamr stream`

Run `streamr <command> <subcommand> --help` to get more information about a a command, its options, and so forth.

If there is a stream parameter in a command, it can be defined as a full id (e.g. `0x1234567890123456789012345678901234567890/foo/bar`) or a path (e.g. `/foo/bar`). If path notation is used, the stream ID is made by prefixing the authenticated Ethereum address (`--private-key <key>`) to the path.

#### Subscribe

Used to subscribe to a stream and output real-time JSON objects to stdout line-by-line.

For example, to subscribe to a public stream such as the tram demo do

```
streamr stream subscribe streamr.eth/demos/helsinki-trams
```

To subscribe to a private stream and authenticate with an Ethereum private key:

```
streamr stream subscribe streamId --private-key <key>
```

To subscribe to a particular [stream partition](https://streamr.network/docs/streams/partitioning), use the partition flag:

```
streamr stream subscribe streamId -p <partition_number>
```

#### Publish

Used to publish events to a stream from stdin line-by-line. Each line should be a valid JSON object.

Example of use:

```
streamr stream publish <streamId> --private-key <key>
```

#### Generate

Generate random JSON objects to stdout line-by-line.

Useful for generating test data to be published to a stream with `publish`, e.g.:

```
streamr mock-data generate | streamr stream publish <streamId> --private-key <key>
```

#### Search

Query a list of streams by a search term and/or permissions. E.g.:

```
streamr stream search foobar --user 0x1234567890123456789012345678901234567890
```

##### Search term

A search term query searchers over the stream id field. E.g:

```
streamr stream search foobar
```

It could find these streams:

```
0x1234567890123456789012345678901234567890/abc/foobar/1
foobar.eth/lorem-ipsum
```

#### Permission

A permission query searches over stream permissions. You can either query by direct permissions (which are explicitly granted to a user), or by all permissions (including public permissions, which apply to all users).

E.g. all streams where a user has some direct permission:

```
streamr stream search --user 0x1234567890123456789012345678901234567890
```

All streams accessible by a user:

```
streamr stream search --user 0x1234567890123456789012345678901234567890 --public
```

The argument of the `--user` option can be omitted. In that case, it defaults to the authenticated user (specified by `--private-key`).

It is also possible to filter by specific permissions by using `--all` and `--any`. E.g. if you want to find the streams you can subscribe to:

```
streamr stream search --user --public --all subscribe --private-key <key>
```

If more than one permission is needed, specify the permissions in a comma-separated list (e.g. `--all subscribe,publish`). It returns streams where _all_ listed permissions are granted. If just _any_ of the permissions is required, use `--any` instead of `--all`. Please prefer `--all` to `--any` when possible as it has better query performance.

#### Show

Show detailed information about a specific stream

```
streamr stream show <streamId> --private-key <key>
```

#### Create

Create a new stream

```
streamr stream create <streamId> --private-key <key>
```

E.g.

```
streamr stream create /foo/bar
streamr stream create 0x1234567890123456789012345678901234567890/foobar
streamr stream create yourdomain.ens/foobar
```

#### Resend

Request a resend of historical data printed as JSON objects to stdout line-by-line.

For example, to fetch the 10 latest messages of a public stream such as the tram demo do

```
streamr stream resend last 10 streamr.eth/demos/helsinki-trams
```

To fetch data starting from a particular date-time

```
streamr stream resend from 2019-05-10T17:00:00 <streamId> --private-key <key>
```

To fetch data between two date-times

```
streamr stream resend range 2019-05-10T17:00:00 2019-05-11T21:00:00 <streamId> --private-key <key>
```

#### Vote

The CLI tool can be used to vote on Streamr governance proposals as an alternative to doing it manually in the [voting UI](https://vote.streamr.network). This is useful if you have tokens in a large number of wallets (for example due to staking) and you therefore prefer to cast your votes programmatically.

```
streamr governance vote <proposalId> <choiceId> --private-key <key>
```

The easiest way to find the `proposalId` is to click on a proposal in the [voting UI](https://vote.streamr.network) and then look at the browser URL. The URL has the form `https://vote.streamr.network/#/proposal/<proposalId>`, i.e. the last part of the URL is the `proposalId`. It starts with `0x...`.

The `choiceId` is just a sequence number. You can again use the UI to check what the choices are. The first option from the top is `1`, the next one is `2`, and so on. For example:

```
streamr governance vote 0x2109759e060ba5a37d70be00522e00da77397f838c01c12f74c8d834ad4f4b0c 1 --private-key <key>
```

You must pass either the `--private-key` or `--config` option.

### Configuration

User can specify environment and authentication details with the following command line arguments:

- `--private-key <key>`, e.g. `--private-key 0x1234567890123456789012345678901234567890123456789012345678901234`
- `--config <file>`, e.g. `--config foobar.json`
- `--dev` use the pre-defined [development environment](https://github.com/streamr-dev/streamr-docker-dev)

The `--config` argument tries to read a configuration file from the current working directory (either without a file extension, or with `.json` extension added). It also tries to read it from `~/.streamr/config/${id}.json` dotfile.

If no `--config` argument is specified, default settings are read from `~/.streamr/config/default.json`, if that file exists.

The configuration file is a JSON. It has one root-level property `client`, which contains any configuration properties for the [streamr-client-javascript](https://github.com/streamr-dev/network-monorepo/blob/main/packages/client/) client. Example:

```
{
    "client": {
        "auth": {
            "privateKey": ...
        }
    }
}
```

### Publish & subscribe piping

You can use the piping facilities of your \*nix operating system with commands `publish` and `subscribe` to achieve some
useful operations. Below is a list of some ideas.

#### Subscribing to a stream from any programming language

You can pipe the line-by-line JSON objects output by `subscribe` to
your program written in any language. Just make the program read JSON objects
from stdin.

```
streamr stream subscribe streamr.eth/demos/helsinki-trams | ruby calculate-average-speed.rb
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
streamr stream subscribe streamr.eth/demos/helsinki-trams | streamr stream publish --dev <streamId> --private-key <key>
```
