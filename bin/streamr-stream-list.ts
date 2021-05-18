#!/usr/bin/env node
import { Command, Option } from 'commander'
import { list } from '../src/list'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv } from './common'
import pkg from '../package.json'

const program = new Command()
program
    .description('fetch a list of streams that are accessible by the authenticated user')
    .option('-s, --search [term]', 'search for term in name or description')
    // TODO could support shorter forms of operations: e.g. "publish" instead of "stream_publish",
    // see streamr-stream-grant-permission.ts
    .addOption(new Option('-o, --operation [permission]', 'filter by permission')
        .choices(['stream_get','stream_subscribe','stream_publish','stream_delete','stream_share'])
        .default('stream_get'))
    .option('--public-access', 'include publicly available streams')
    .option('--no-granted-access', 'exclude streams that user has directly granted permissions to')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((options: any) => {
        const query: any = {
            operation: options.operation,
            noConfig: true,
            publicAccess: options.publicAccess,
            search: options.search,
            grantedAccess: options.grantedAccess
        }    
        list(query, formStreamrOptionsWithEnv(options))
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 0, 0)