#!/usr/bin/env node
const program = require('commander')

program
    .version(require('../package.json').version)
    .usage('<command> [<args>]')
    .description('command line tools for interacting with Streamr https://www.streamr.com')
    .command('generate', 'generate JSON data')
    .command('listen', 'listen to a stream')
    .command('publish', 'publish to a stream')
    .parse(process.argv)
