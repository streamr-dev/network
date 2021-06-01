#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('miscellaneous subcommands')
    .command('get-session-token', 'get a session token for the current user')
    .parse(process.argv)
