#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('mock-data subcommands')
    .command('generate', 'generate random JSON or binary data')
    .parse()
