#!/usr/bin/env node -r ts-node/register
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> <subcommand> [<args>]')
    .description('command line tools for interacting with Streamr https://streamr.network')
    .command('stream', 'stream subcommands')
    .command('storage-node', 'storage node subcommands')
    .command('mock-data', 'mock data subcommands')
    .parse(process.argv)
