#!/usr/bin/env node
const program = require('commander')

program
    .version(require('../package.json').version)
    .usage('<command> [<args>]')
    .description('command line tools for interacting with Streamr https://www.streamr.com')
    .command('generate', 'generate JSON data')
    .command('listen', 'listen to a stream')
    .command('publish', 'publish to a stream')
    .command('list', 'fetch a list of streams')
    .command('show', 'info about a stream')
    .command("create", "create a new stream")
    .command('resend', 'request resend of a stream')
    .parse(process.argv)
