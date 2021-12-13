#!/usr/bin/env node
import { Command } from 'commander'
import { show } from '../src/show'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, getStreamId } from './common'
import pkg from '../package.json'
import { createClient } from '../src/client'

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
        const client = createClient(options)
        show(streamId, options.includePermissions, client)
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)