#!/usr/bin/env node -r ts-node/register
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('command line tools for interacting with Streamr https://streamr.network')
    .command('generate', 'generate JSON data')
    .command('subscribe', 'subscribe to a stream')
    .command('publish', 'publish to a stream')
    .command('list', 'fetch a list of streams')
    .command('show', 'info about a stream')
    .command("create", "create a new stream")
    .command('resend', 'request resend of a stream')
    .parse(process.argv)
