#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('governance subcommands')
    .command('vote', 'votes on a governance proposal')
    .parse()
