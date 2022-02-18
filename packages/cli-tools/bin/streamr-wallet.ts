#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('wallet subcommands')
    .command('whoami', 'displays your public address')
    .parse()
