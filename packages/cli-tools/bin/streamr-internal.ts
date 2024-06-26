#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('subcommands for internal use, the API of the commands may change')
    .command('visualize-topology', 'visualize network topology')
    .parse()
