#!/usr/bin/env node
import { Command } from 'commander'
import { show } from '../src/show'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv, getStreamId } from './common'
import pkg from '../package.json'

const program = new Command()
program
    .arguments('<streamId>')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions (requires SHARE permission)')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((streamIdOrPath: string, options: any) => {
        const streamId = getStreamId(streamIdOrPath, options)!
        show(streamId, options.includePermissions, formStreamrOptionsWithEnv(options))
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)