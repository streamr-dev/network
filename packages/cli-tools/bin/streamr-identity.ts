#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('identity subcommands')
    .command('whoami', 'displays your public key')
    .command('generate', 'generates a new key pair')
    .parse()
