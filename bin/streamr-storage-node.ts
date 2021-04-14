#!/usr/bin/env node -r ts-node/register
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('storage node subcommands')
    .command('list', 'list storage nodes')
    .command('add-stream', 'add stream')
    .command('remove-stream', 'remove stream')
    .command('list-stream-parts', 'list stream parts in a storage node')
    .parse(process.argv)
