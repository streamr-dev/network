#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('storage node subcommands')
    .command('list', 'list storage nodes')
    .command('add-stream', 'add stream')
    .command('remove-stream', 'remove stream')
    .command('list-streams', 'list stream in a storage node')
    .parse()
