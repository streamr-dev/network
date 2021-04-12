#!/usr/bin/env node -r ts-node/register
import { Command } from 'commander';
import { list } from '../src/list'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv } from './common'
import pkg from '../package.json'

const program = new Command();
program
    .description('fetch a list of streams that are accessible by the authenticated user')
    .option('-s, --search [term]', 'search for term in name or description')
    .option('-o, --operation [permission]', 'filter by permission', /^(stream_get|stream_subscribe|stream_publish|stream_delete|stream_share)$/i, 'stream_get')
    .option('--public-access', 'include publicly available streams')
    .option('--no-granted-access', 'exclude streams that user has directly granted permissions to')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 0, 0)

const query: any = {
    operation: program.operation,
    noConfig: true
}
if ("publicAccess" in program) {
    query.publicAccess = program.publicAccess
}
if ("search" in program) {
    query.search = program.search
}
if ("grantedAccess" in program) {
    query.grantedAccess = program.grantedAccess
}

// @ts-expect-error
const options = formStreamrOptionsWithEnv(program);
list(query, options)

