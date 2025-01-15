#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('subcommands for internal use, the API of the commands may change')
    .command('node-info', 'info about a node')
    .command('visualize-topology', 'visualize network topology')
    .command('show-sdk-config', 'show config used by internal StreamrClient')
    .command('sponsorship-sponsor', 'sponsor a sponsorship')
    .command('operator-delegate', 'delegate funds to an operator')
    .command('operator-undelegate', 'undelegate funds from an operator')
    .command('operator-stake', 'stake operator\'s funds to a sponsorship')
    .command('operator-unstake', 'unstake all operator\'s funds from a sponsorship')
    .parse()
