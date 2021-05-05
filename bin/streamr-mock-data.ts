#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('mock-data subcommands')
    .command('generate', 'generate JSON data')
    .parse(process.argv)
