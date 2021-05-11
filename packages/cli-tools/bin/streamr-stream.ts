#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

program
    .version(pkg.version)
    .usage('<command> [<args>]')
    .description('stream subcommands')
    .command('subscribe', 'subscribe to a stream')
    .command('publish', 'publish to a stream')
    .command('list', 'fetch a list of streams')
    .command('show', 'info about a stream')
    .command("create", "create a new stream")
    .command('resend', 'request resend of a stream')
    .command('grant-permission', 'grant permission')
    .command('revoke-permission', 'revoke permission')
    .parse(process.argv)
